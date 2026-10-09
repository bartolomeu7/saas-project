# Missão 07.1 — Fechar bloqueios e preparar release

Data: 2026-10-09 · Branch: `fix/mission-07-hardening` (publicada em `origin`, **sem PR e sem merge**) · Ponto de partida: `1d7e9a3`. Production: **nenhuma escrita** (somente leituras).

## Veredito

**CORREÇÕES VALIDADAS COM RESSALVAS**

O que ficou provado nesta etapa: compatibilidade entre código antigo e banco novo, rollback exato, contrato EvoPay conforme a documentação oficial, build do Preview na Vercel e regressão do banco. O que **não** pôde ser provado e continua marcado: concorrência real (sem a service-role key de TEST), EvoPay real (sem sandbox), login/Admin/T10 reais (sem sessão e sem conector Clerk), runtime do Preview (sem variáveis de TEST e protegido por SSO da Vercel), e todos os dados jurídicos. Nada disso foi dado como aprovado.

## 1. Migrations: revisão e compatibilidade

Lidas integralmente: `20261011000000_billing_hardening.sql` e `20261011000100_privilege_minimization.sql`, com `tests/sql/billing_confirm.sql`.

**Funções/RPCs e chamadas afetadas**

| Objeto | Mudança | Quem chama |
|---|---|---|
| `confirm_subscription_payment` | assinatura de 6 → 7 argumentos (7º com default), novo retorno `rejection` | `confirmPaymentFromProvider` (webhook, "Já paguei", reverificação do admin) |
| `claim_subscription_payment` | nova | `POST /api/billing/create-payment` |
| `platform_diagnostics` | 11 → 13 verificações | `/admin/tools` (consumidor genérico, lê `check_key` por nome) |
| índice `subscription_payments_one_open_evopay_charge_idx` | novo | INSERT em `subscription_payments` |
| privilégios de `anon`/`authenticated`, EXECUTE de funções de trigger, privilégios padrão do `postgres` | reduzidos | todo o app via PostgREST |

**A remoção da assinatura antiga quebra o código publicado (`3931854`)?** Não. Achado e correção desta etapa: o código antigo chama a função com 6 argumentos nomeados e já envia no payload a resposta do provedor. A função nova resolve essa chamada (o 7º argumento tem default) e, como o `p_provider_amount` vem nulo, **passa a ler `amount` do payload, apenas se for JSON number** (migration revisada e reaplicada em TEST como `billing_hardening_compat_payload_amount`). Continua fail-closed.

Prova (`tests/sql/billing_compat_old_code.sql`, TEST, transação revertida):

| Caso | Esperado | Obtido |
|---|---|---|
| C1 antigo + payload com amount correto | concede | `true/paid/-` + 1 assinatura |
| C2 antigo + amount divergente | rejeita | `false/pending/AMOUNT_MISMATCH` |
| C3 antigo sem amount | rejeita | `false/pending/AMOUNT_MISSING` |
| C4 antigo com amount em texto | rejeita | `false/pending/AMOUNT_MISSING` |
| C5 antigo `expired` | ok | `true/expired/-` |
| C8 chamada nova: parâmetro explícito prevalece | concede | `true/paid/-` |
| C6 INSERT antigo duplicado (empresa+plano) | barrado | `unique_violation` |
| C7 plano diferente na mesma empresa | permitido | permitido |

**Ordem segura:** migrations em Production → deploy do código. Código novo + banco antigo falha fechado (sem `claim`, nada é cobrado). Detalhes em `docs/billing-hardening.md`.

**Rollback/recuperação (testado):** `supabase/rollback/*.down.sql`. Em TEST, numa transação revertida: snapshot de ACL (877 entradas) → aplica os dois rollbacks → o digest `c2c9718c4974c4d19a4dddbfba6a93a3` é **idêntico ao de Production** (ainda sem as migrations) → reaplica as migrations → digest igual ao do estado anterior. Reproduzível com `node tests/sql/build-rollback-test.mjs <digest>`.

Achados da revisão dos privilégios (migration não precisou mudar):

- Os privilégios por coluna de `authenticated` em `products` e `sales` (15 colunas) não são tocados pela migration; um `REVOKE` de tabela os apagaria, por isso o rollback é só `GRANT` (aditivo).
- Os privilégios padrão do role `supabase_admin` no schema `public` (objetos criados por esse role) não foram alterados. Migrations e SQL editor rodam como `postgres`, coberto.

## 2. Idempotência financeira e concorrência real

| ID | Cenário | Resultado |
|---|---|---|
| F1 | Chamadas realmente simultâneas pelo MCP | **Impossível**: duas `execute_sql` disparadas juntas foram serializadas (a segunda só começou depois que a primeira soltou o lock, `waited_s=0.007`). |
| F2 | Sessões paralelas dentro do banco (`dblink`) | **Negado** pelo ambiente (Containment Escape); não contornado. |
| F3 | Script real de concorrência por HTTP (`tests/integration/billing-concurrency.mjs`, S1–S10) | **BLOCKED**: `SUPABASE_SERVICE_ROLE_KEY` de TEST ausente no `.env.local` (comprimento 0); o script aborta com segurança. |
| F4 | Bateria sequencial de idempotência (`billing_confirm.sql`) | **69/69** (reexecutada após a revisão da função). |
| F5 | Restrição única parcial, lock por empresa+plano, lock por empresa | cobertos em F4; a barreira de banco foi exercitada, a corrida em si não. |

Cenários prontos no script, aguardando a chave: S1 mesma intenção ×12; S2 confirmação simultânea do mesmo evento; S3 reentregas com ids distintos; S4 dois pagamentos da mesma empresa nova; S5 valor errado/ausente simultâneo; **S6 intenções distintas**; **S7 reserva abandonada (timeout) + retentativas**; **S8 cobrança já criada reaproveitada**; **S9 claim × confirmação**; **S10 estorno concorrente**.

**Como liberar (sem expor segredo no chat):** o dono copia a service-role key do projeto **TEST** (Supabase → Project Settings → API) para a linha `SUPABASE_SERVICE_ROLE_KEY=` do arquivo local `.env.local` e roda `npm run test:integration:billing`. O script recusa qualquer projeto que não seja o TEST e remove tudo que criou. Resultado esperado: todos PASS; qualquer FAIL deve ser tratado como defeito.

## 3. EvoPay sem transações reais

Documentação oficial consultada (https://docs.evopay.cash): valores em **reais decimais, nunca centavos**; campo `amount` (bruto); moeda e referência externa **não** são devolvidas; status PENDING/COMPLETED/CANCELED/WAITING_FOR_REFUND/REFUNDED/EXPIRED; webhook **sem assinatura e com uma única tentativa**; idempotência por `id + status`; sem sandbox. A tabela completa e o tratamento no código estão em `docs/billing-hardening.md`.

Testes: `tests/unit/evopay-contract.test.mjs` (7 casos: exemplo oficial, status, parcial, a mais, centavos×reais, ilegível, status desconhecido) e as baterias de valor do SQL. **Parcial, ausente, inválido, divergente: todos rejeitados.** O que a documentação não diz (pagamento parcial; se o GET real devolve exatamente o formato documentado) continua **NOT VERIFIED** e não foi presumido.

## 4. CI e Preview

| ID | Item | Resultado |
|---|---|---|
| C1 | Workflow usa Node 22 e executa lint, typecheck, test:unit e build | **Confirmado no arquivo** (`.nvmrc` = 22; passos na ordem). Localmente (Node 24): lint 0 erros, typecheck limpo, 71 testes unitários (70 pass, 1 skip), build OK, build sem credenciais OK. |
| C2 | Execução no GitHub Actions | ver seção "Execução do CI" abaixo |
| C3 | Preview na Vercel compila (antes falhava sem env) | **PASS**: deployment `Preview` da branch concluído com sucesso (status do commit: "Deployment has completed"). |
| C4 | Banco de destino do Preview | **Não validado.** A variável compartilhada `NEXT_PUBLIC_SUPABASE_URL` tem alvo preview+production (valor de Production). Como o Preview desta branch **não tem** chave anon, Clerk nem service role, ele não consegue falar com banco nenhum: nenhum teste autenticado foi (nem deve ser) executado nele. |
| C5 | Runtime do Preview | O deployment está atrás da autenticação da Vercel (SSO, 302 para `vercel.com/sso-api`); **não exercitado**. |
| C6 | Configuração do Preview | **Não alterada por mim** (inserir chaves/tokens na Vercel é ação que cabe ao dono). Variáveis, escopos e passos em `docs/ci-and-environments.md`. Nenhuma credencial de Production foi copiada para Preview. |

## 5. Autenticação, Admin e T10

**BLOCKED / NOT VERIFIED.** Sem sessão no navegador embutido; o conector do Clerk exige autenticação (`whoami` recusado); criar conta ou digitar senha não é permitido ao agente. Alternativos executados em TEST: identidade `auth_identity.sql` 22/22; Admin/RBAC `admin_platform.sql` 299/299 (rodado na Missão 07, estado final); consentimento `legal_consent.sql` 73/73; gate unitário (13 testes); app local contra TEST com privilégios minimizados: páginas públicas 200, `/app` `/admin` `/onboarding` `/aceite-termos` redirecionam para o login, `POST /api/billing/create-payment` sem sessão 401, webhook sem `id` 200 sem registrar nada. Roteiro manual com SQL de verificação: `docs/qa/manual-auth-t10-checklist.md`.

Observação (não relacionada às mudanças): em `next dev` a Home (`ScrollProgress`) registra aviso de hidratação no console; o componente não foi tocado por esta branch e a leitura do console de Production (limitada: só captura após o carregamento) não mostrou erro. Não corrigido; fica como item de acompanhamento.

## 6. Documentação jurídica

Inventário refeito no repositório (e-mails, CNPJ, razão social, DPO): nada novo encontrado; `suporte@primeges.com.br` continua sendo só um candidato não confirmado. `1.0.0-rc.2` mantida, hashes inalterados. `docs/legal/final-publication-checklist.md` atualizado com o responsável por cada dado. Nenhum texto jurídico foi alterado.

## 7. Matriz resumida de evidências

| ID | Ambiente | Cenário | Status | Evidência |
|---|---|---|---|---|
| M1 | TEST | compat código antigo × banco novo (8 casos) | PASS | `billing_compat_old_code.sql` |
| M2 | TEST | rollback exato de ACL e assinaturas = Production | PASS | digest `c2c9…` |
| M3 | TEST | replay das migrations após rollback | PASS | digest igual ao estado anterior |
| M4 | TEST | billing 69/69 após revisão | PASS | `billing_confirm.sql` |
| M5 | local | 71 testes unitários | PASS (1 skip preexistente) | `npm run test:unit` |
| M6 | local | lint / typecheck / build / build sem credenciais | PASS | 0 erros (11 avisos preexistentes) |
| M7 | Vercel | build do Preview da branch | PASS | status do commit |
| M8 | Vercel | runtime / banco do Preview | NOT VERIFIED | SSO; env incompleto |
| M9 | TEST | concorrência real | BLOCKED | chave de TEST ausente |
| M10 | — | EvoPay real | NOT VERIFIED | sem sandbox |
| M11 | — | login/Admin/T10 reais | BLOCKED | sem sessão |
| M12 | — | Clerk dashboard | BLOCKED | conector sem autenticação |
| M13 | — | dados e revisão jurídica | BLOCKED | informação empresarial/jurídica |
| M14 | Production | smoke somente leitura; sem escrita | PASS | 71 migrations, 0 pagamentos, 1 super_admin |

## 8. Riscos financeiros residuais

1. Corrida real não exercitada (garantida por lock + índice, não por teste paralelo).
2. Formato real do `amount` da EvoPay não provado; falha fechada pode rejeitar a primeira cobrança legítima (mitigação: admin registra pagamento manual; diagnóstico `payment_events_unprocessed`).
3. Webhook de tentativa única + sem reconciliação agendada: pagamento feito com a página fechada e webhook perdido só libera acesso via reverificação.
4. Estorno não revoga acesso (decisão de negócio).
5. Dados do pagador em `payment_events.payload` sem expurgo.
6. Janela entre migration e deploy: o código antigo erra de forma segura ao tentar "pagar de novo" com cobrança aberta.

## 9. Para fechar o que falta (ordem sugerida, tudo com autorização do dono)

1. Colocar a service-role key de **TEST** em `.env.local` e rodar `npm run test:integration:billing`.
2. Abrir o PR para a `main` (ou usar `workflow_dispatch` depois do merge) e conferir o CI em Node 22.
3. Criar as variáveis de Preview do `docs/ci-and-environments.md` com credenciais de TEST/Clerk Development, separar `NEXT_PUBLIC_SUPABASE_URL`, e só então executar `docs/qa/manual-auth-t10-checklist.md`.
4. Autorizar a aplicação das duas migrations em Production, depois o deploy do código; smoke e T10 manual; uma cobrança de valor mínimo para fechar o contrato EvoPay.
5. Fornecer os dados da empresa e passar os documentos pela revisão jurídica.
