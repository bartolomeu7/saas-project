# Missão 08 — Fechamento técnico, regressão final e validação do Preview

**Veredito: YELLOW — pronta para revisão de Go-Live, com ressalvas explícitas (seção 16).**
Nenhum critério de bloqueio técnico conhecido permanece. As ressalvas são provas que não puderam ser produzidas (concorrência real, runtime autenticado, EvoPay real) e pendências de negócio/jurídico, todas listadas abaixo. **Não foi feito merge, nem migration em Production, nem deploy, nem SQL de escrita em Production.**

Legenda de evidência: `VERIFIED` (executado e observado nesta revisão) · `NOT VERIFIED` · `BLOCKED` (impedimento registrado) · `INFERRED` (deduzido, sem execução direta).

## 1. Data, hora e ambiente

- Revisão final: **2026-10-13, 19:53–20:30 (America/Sao_Paulo, UTC−03:00)**.
- Local: Windows 10, Node **v24.19.0** (máquina local). CI: Node **v22.23.3** (`.nvmrc` = 22, `actions/setup-node@v4`, runner `ubuntu-latest`).
- Bancos: **TEST** (`zlmxbqlpjstmllrvafmy`) para todas as baterias e testes de escrita; **Production** (`fpbcruinppjbwtinzrdg`) somente leitura. `.env.local` aponta para o TEST (projeto conferido, sem imprimir segredos); a chave service-role está **ausente** (ver seção 11).

## 2. Branch, commit, PR (Etapa A — preflight)

| Item | Valor |
|---|---|
| Branch da Missão 08 | `feat/mission-08-admin-control-center` (local = `origin`, 0 à frente/atrás do remoto no início) |
| HEAD no início | `14133ac6390d431707820ae5cfe930112ea0cb9b` |
| Commit de código final (esta revisão) | `546b2e651aaa40f846dc95109d6d09e41cf9d7a1` |
| Relação com `origin/main` (`3931854`) | 17 commits à frente (+ os desta revisão), **0 atrás** — sem conflito |
| Working tree no início | limpo, exceto `b.txt` (não rastreado, 0 bytes, **preservado**) |
| PR | [#33](https://github.com/bartolomeu7/saas-project/pull/33) — `OPEN`, `MERGEABLE`, `CLEAN`, base `main` |
| Missão 07/07.1 | `fix/mission-07-hardening` (`c71ad02`) **não está em `main`**, mas **está contida em HEAD** (ancestral). O PR #33 **carrega 07 + 07.1 + 08**; não houve merge de branches. Dependência registrada: aprovar o #33 aprova as três missões. |
| Remoto | push **fast-forward** `14133ac..546b2e6` (sem force) |

## 3. Escopo realizado nesta revisão

1. Preflight (Etapa A) e auditoria do diff completo (Etapa B): 74 arquivos / +7.612 −197 contra `origin/main` antes desta revisão — todos pertencentes às Missões 07/07.1/08 (migrations, rollbacks, `src/lib/{billing,admin,legal}`, `src/components/admin`, páginas `/admin`, testes, docs, CI).
2. Regressão local e em TEST completa (Etapa C): **tudo reexecutado**, nenhum número reaproveitado de relatórios anteriores.
3. **1 defeito real encontrado, provado e corrigido** (seção 9).
4. Limpeza/verificação do diff (Etapa D) e publicação da branch (Etapa E).
5. CI e Preview (Etapa F) e este relatório (Etapa G).

## 4. Arquivos e migrations

- **Migrations (5, ainda NÃO aplicadas em Production):** `20261011000000_billing_hardening`, `20261011000100_privilege_minimization`, `20261012000000_lifetime_access_and_license_ops`, `20261012000100_plans_lifetime_awareness`, `20261012000200_admin_company_members_and_reconciliation` (esta última alterada nesta revisão — seção 9).
- **Rollbacks:** `supabase/rollback/*.down.sql` (5) + `build-down-20261012.mjs`. Regenerados nesta revisão a partir do histórico versionado: **resultado idêntico ao commitado** (`git status` limpo) — `VERIFIED`.
- **Alterados nesta revisão (commit `546b2e6`):** `supabase/migrations/20261012000200_…sql`, `tests/sql/company_members_reconcile.sql`, `docs/license-and-lifetime.md`. Este relatório está no commit seguinte (somente docs).
- Nenhum arquivo temporário: a página `src/app/dev-harness` foi removida antes de qualquer commit (`git ls-files | grep dev-harness` = 0); sem imagens/logs/`.env` rastreados (só `.env.example`); varredura de padrões de segredo no diff: apenas texto de documentação e valores obviamente falsos de teste (`chave-de-teste-nao-real`, `*.invalid`).

## 5. Resultados reais das baterias (todas no TEST, transação revertida)

| Bateria | Arquivo | Checks | Resultado | Obs. |
|---|---|---:|---|---|
| Licenças / Lifetime / idempotência | `tests/sql/license_ops.sql` | 96 | **96 ✔ / 0 ✘** | `VERIFIED` |
| Membros, propriedade, reconciliação | `tests/sql/company_members_reconcile.sql` | 50 | **50 ✔ / 0 ✘** | eram 44; +6 do defeito corrigido (seção 9) |
| Admin / RBAC | `tests/sql/admin_platform.sql` | 299 | **299 ✔ / 0 ✘** | 23 grupos |
| Billing (claim/confirm/estorno/atomicidade) | `tests/sql/billing_confirm.sql` | 69 | **69 ✔ / 0 ✘** | ver nota 69×65 |
| Compatibilidade código antigo × banco novo | `tests/sql/billing_compat_old_code.sql` | 9 linhas (C1–C8) | **todas conforme o esperado** | C2/C3/C4 rejeitam; C6 `unique_violation` |
| Isolamento entre empresas | `tests/sql/tenant_isolation.sql` | 39 tabelas × SELECT/UPDATE/DELETE + 21 sondas | **0 vazamentos**; todas as sondas negadas/0 linhas | inclui 4 sondas novas (licença, membros, chaves) |
| Identidade Clerk → perfil | `tests/sql/auth_identity.sql` | 21 | **21 conforme o esperado** | o "22" de relatórios antigos não corresponde ao arquivo atual (21 sondas) |
| Consentimento legal | `tests/sql/legal_consent.sql` | 73 | **73 ✔ / 0 ✘** | rc.2 vigente; T10 simulado |
| Unitários | `npm run test:unit` | 81 | **80 ✔ / 0 ✘ / 1 *skipped*** | o skip é intencional (`LEGAL_REQUIRE_PUBLISHABLE=1`: falharia hoje porque os docs legais ainda têm marcadores pendentes) |

**Nota 69 × 65 (billing):** o arquivo do repositório tem **69** checks e é o que foi executado (69/69). O "65" citado em descrições anteriores (corpo do PR) vinha de uma versão antiga do arquivo, antes da inclusão do diagnóstico de 14 verificações e de checks de atomicidade; **não há versão consolidada paralela**. O corpo do PR foi corrigido.

**Idempotência:** coberta em `license_ops` (mesma chave ⇒ `replayed=true`; chave em outra empresa/tipo ⇒ recusada; falha não consome a chave; nova chave ⇒ nova concessão), em `company_members_reconcile` (adicionar/transferir) e em `billing_confirm` (mesmo `event_id`, reentrega, pending tardio). **São testes sequenciais** — não provam concorrência (seção 11).

## 6. Lint, typecheck, build

| Verificação | Local (Node 24.19.0) | CI (Node 22.23.3) |
|---|---|---|
| `npm run lint` | **0 erros**, 10 avisos preexistentes (`react-hooks`) | `VERIFIED` (run anterior `38477983851`: success) |
| `npm run typecheck` | **exit 0** (nota abaixo) | success |
| `npm run test:unit` | 80/81 (1 skip intencional) | idem (`# tests 81, # pass 80`) |
| `npm run build` (env fictício do CI) | **exit 0**, 14 páginas estáticas + rotas dinâmicas | success |

- *Nota typecheck:* a primeira execução local falhou só por tipos gerados obsoletos em `.next/dev/types` (cache **ignorado pelo Git** do meu dev server, que apontava para a página temporária já removida). Removi apenas `.next/dev`; a segunda execução passou. Não é defeito de código.
- *Aviso de build (informativo):* "`process.cwd` não é suportado no Edge Runtime" vem de dentro de `node_modules/next` (`dynamic-rendering.js`, via `next/server` no middleware); não há `process.cwd` em `src/`. Preexistente da stack, sem efeito no build.

## 7. CI e Preview (Etapa F)

| Item | Evidência |
|---|---|
| Workflow | **Phase 3 CI** (`verify`), `ubuntu-latest`, Node **22.23.3** (`.nvmrc`) |
| Passos | `npm ci` → `lint` → `typecheck` → `test:unit` (81 testes, 80 pass, 1 skip) → `build` |
| Run do commit de código `546b2e6` | [38482199078](https://github.com/bartolomeu7/saas-project/actions/runs/38482199078) — **success** (1m38s), `pull_request` — `VERIFIED` |
| Runs anteriores da mesma branch | `38477983851` (`14133ac`), `38477286803` (`67f9615`) — success |
| Preview (Vercel) | deployment GitHub `7052305897`, ambiente **Preview**, **sha `546b2e651aaa40f846dc95109d6d09e41cf9d7a1`** (= commit de código), estado **success** ("Deployment has completed") — [painel Vercel](https://vercel.com/juninhormatos-9956s-projects/saas-project/G2xNE8itzo3Vk4tfpyJwh1QrPY61); URL: `saas-project-nzw19upay-juninhormatos-9956s-projects.vercel.app` |
| Proteção do Preview | leitura HTTP anônima (somente GET): `/` e `/admin` → **302** para `vercel.com/sso-api` (**SSO da Vercel ativo**). **Não foi desativado nem contornado.** |
| Runtime autenticado do Preview | **`BLOCKED`** — SSO + sem sessão; nada foi logado nem escrito no Preview |
| Destino de dados do Preview (qual Supabase) | **`NOT VERIFIED`** — não li variáveis do projeto Vercel (poderiam expor segredos) e não alterei nenhuma. Como o destino não está comprovado, **nenhum teste de escrita foi feito contra o Preview** |
| Teste alternativo realmente executado | build de produção local com env fictício do CI (exit 0) + baterias SQL no TEST + o build do próprio Preview/CI |

*O relatório entra em um commit seguinte, somente de documentação; o CI desse commit é conferido ao publicar (ver resposta final).*

## 8. Evidências de segurança e isolamento

- **Autorização no servidor:** todas as Server Actions novas chamam `requirePlatformAdmin()`/`requireSuperAdmin()` **antes** de qualquer efeito, validam com zod (UUIDs, enums, motivo, confirmação, chave de idempotência) e delegam a decisão final ao banco (cada RPC `SECURITY DEFINER` exige `is_platform_admin()`/`is_super_admin()`). A reconciliação só usa IDs devolvidos por RPC protegida e só concede acesso pelo caminho já testado `confirm_subscription_payment` (valor do provedor = valor esperado) — `VERIFIED` por leitura do código + baterias.
- **Privilégios (ACL, consultados no TEST):** das 23 funções novas/alteradas, `anon` não tem EXECUTE em nenhuma exceto `get_public_plans` (catálogo público, sem Lifetime); helpers internos (`platform_apply_access`, `platform_begin/finish_operation`, `platform_extend_access_core`, `claim`/`confirm_subscription_payment`) só `service_role`; nenhuma com EXECUTE para `PUBLIC`; todas `SECURITY DEFINER` com `search_path=public`.
- **Lifetime:** modelo `expires_at IS NULL ⇔ lifetime` imposto por CHECK; plano `LIFETIME` sem preço/duração, fora do catálogo público e de `getPlans` (cliente), recusado por `claim_subscription_payment`; **MRR exclui Lifetime** (`not s.lifetime`, `price > 0`) e a receita é separada em `evopay_30d`/`manual_30d`/`pending_total`/`refunded_total`; as migrations só **inserem** o plano LIFETIME — não alteram nem apagam os planos comerciais de 31/93/365 dias (`grep` das migrations).
- **Limites do admin:** admin comum ≤ `admin_max_free_days` (30) sem pagamento; super_admin ≤ 365; Lifetime só super_admin; admin não cancela/ajusta vencimento (testes `access`/`policy`).
- **Último super_admin:** protegido mesmo via `service_role` (5 checks `last_super`).
- **RLS / tenants:** 39 tabelas com `company_id`: 0 leituras/alterações/exclusões cruzadas; `platform_operation_keys` ilegível para `authenticated`.
- **Autoprivilégio de membros:** defeito corrigido (seção 9).

## 9. Defeito encontrado e corrigido nesta revisão

**`admin_add_company_member` permitia autoprivilégio.** Um administrador comum da plataforma podia se adicionar (pelo próprio e-mail) a qualquer empresa-cliente com vaga no plano. O vínculo de membro dá acesso por RLS aos dados do tenant; o desenho do Admin é "apenas agregados". **Prova (TEST, transação revertida):** antes — admin enxergava 0 clientes da empresa; após se autoadicionar — enxergava 1. Também permitia a um admin colocar outro admin da plataforma em uma empresa, e `admin_set_company_member_role` permitia mudar o próprio papel.

**Correção (mínima, no banco, onde está a autoridade):** (a) ninguém se adiciona a uma empresa (nem `super_admin`); (b) só `super_admin` adiciona outro administrador da plataforma (decisão deliberada, auditada); (c) ninguém altera o próprio papel na empresa. Aplicada à migration `20261012000200` (ainda não publicada em Production) **e** ao TEST (entrada de migration `admin_members_no_self_privilege`). Bateria de membros: 44 → **50** checks, **50/50**. Rollback inalterado (o `down` de `000200` apenas remove as funções). Documentado em `docs/license-and-lifetime.md`.

## 10. Diferenças TEST × Production (documentadas, não apagadas)

1. **Production tem 71 migrations (última `20261008202401`) e NENHUMA das 5 desta entrega**; confirmado agora: sem coluna `subscriptions.lifetime`, 0 pagamentos, 1 assinatura (`trialing`, vence 2026-10-17), 2 perfis, 1 empresa, 1 entitlement, 1 super_admin ativo. `VERIFIED` (leitura).
2. **Histórico do TEST não é 1:1 com os arquivos do repositório:** o TEST aplicou o billing em 3 entradas (`billing_hardening`, `…_company_lock`, `…_compat_payload_amount`) e as demais com timestamps próprios, mais `admin_members_no_self_privilege` (nova, desta revisão); o repositório tem 5 arquivos consolidados. Ao aplicar em Production será gerada nova versão por migration.
3. **Texto das funções:** as 5 migrations têm 24 definições completas de 23 funções distintas (`confirm_subscription_payment` aparece em duas; vale a última). No TEST: **16 têm hash idêntico**; **7** (`admin_add_company_member`, `admin_assign_plan`, `admin_grant_license`, `admin_reactivate_subscription`, `admin_record_manual_payment`, `confirm_subscription_payment`, `platform_begin_operation`) **diferem só em comentários/espaços** (hash idêntico após normalizar) — nenhuma divergência de lógica. As demais alterações são reescritas guiadas (`pg_temp.rewrite_fn`) com contagem exata de padrões; os 28 padrões casavam com o texto de Production no pré-check anterior (Production não mudou — item 1, `INFERRED` para o estado atual).
4. **Deriva legada preexistente** (≈15 funções antigas com texto diferente entre TEST e Production, achada na prova de rollback da 07.1): **não explicada nem corrigida** — fora do escopo; as funções dessa lista que o rollback restaura são ancoradas ao texto versionado/Production. Recomendação: repetir a comparação de fingerprints imediatamente antes do Go-Live (`NOT VERIFIED` nesta revisão).
5. Fixtures só do TEST (plano inativo `TEST_R1`, perfis de teste) não existem em Production.

## 11. Concorrência financeira — limites do que foi provado

- **`BLOCKED`:** `tests/integration/billing-concurrency.mjs` (S1–S10, chamadas simultâneas reais com service-role) exige `SUPABASE_SERVICE_ROLE_KEY` **do TEST**; `.env.local` não a tem. Não usei credenciais de Production nem inventei uma.
- O MCP do Supabase **serializa** chamadas paralelas; logo as baterias SQL são **sequenciais** e não provam corrida real. O que existe é *mecanismo* (advisory locks por empresa/intenção, PK/UNIQUE em `platform_operation_keys`, índice parcial único de cobrança aberta) — `INFERRED` como suficiente, não provado sob carga.
- Risco residual: duas requisições simultâneas com a **mesma** chave dependem do `INSERT … ON CONFLICT` serializar; duas com chaves **diferentes** para a mesma empresa serializam pelo lock de empresa. Ambos corretos pelo desenho, **sem prova concorrente**.

## 12. EvoPay

- Contrato oficial relido em 07.1: valores em reais decimais; `GET /pix?id=` é a fonte de verdade; webhook **sem assinatura** e com **uma tentativa**; **sem sandbox**.
- **`NOT VERIFIED` com a EvoPay real** (nenhuma cobrança real foi feita, como exigido). Sistema **falha fechado**: valor ausente/divergente/texto ⇒ rejeita e não concede (C2–C4, `amount`/`events`/`refund`). O payload do provedor é minimizado antes de persistir.
- A reconciliação (botão em `/admin/payments`, lote de 15, orçamento de 8 s) é a rede de segurança do webhook de tentativa única; não há agendamento automático (exigiria segredo de cron).

## 13. Clerk, login e painel autenticado

- **`NOT VERIFIED`/`BLOCKED`:** nenhum login real, nenhum painel `/admin` autenticado em navegador, nenhum T10 real (sem sessão Clerk e sem permissão para digitar senha). A autenticação foi **simulada** por `request.jwt.claims` nas baterias SQL (equivalente ao que o PostgREST recebe do JWT do Clerk) — prova a camada de banco, **não** o middleware/UI/Clerk.
- Os diálogos novos (licença) foram exercitados na revisão anterior em harness local (removido): opções admin × super, limite de dias, bloqueio de Lifetime duplicado, 375 px sem overflow — `VERIFIED` naquela sessão, não reexecutado.
- **Convite/criação de usuário pela API oficial do Clerk: NÃO implementado.** Hoje o admin só vincula perfis **existentes**.

## 14. Pendências de licenças, equipe, propriedade e reconciliação

1. Convite de usuários via Clerk (funcionalidade incompleta).
2. `platform_operation_keys` sem política de retenção (cresce com o uso; volume baixo — limpeza futura).
3. Reconciliação manual (sem job agendado) e limitada a 15 por clique.
4. Transferir propriedade/adicionar exige o usuário já ter conta e estar ativo; modelo atual = **1 empresa por usuário**.
5. Revogar Lifetime = `admin_assign_plan` por super_admin com prazo; sem fluxo dedicado de UI além disso.

## 15. Rollback

- Scripts regeneram idênticos ao versionado (`VERIFIED`). A prova numérica anterior (aplicar os `down` em transação no TEST e comparar fingerprints de catálogo/ACL com Production) **não foi reexecutada** nesta revisão; a única mudança de banco desta revisão altera duas funções que o `down` de `000200` simplesmente remove, então o resultado esperado é o mesmo (`INFERRED`). Recomendo reexecutá-la antes do Go-Live.
- `down` de `20261012000000` **recusa rodar** se existir assinatura vitalícia (converter antes).
- Ordem: `000200` → `000100` → `000000` → `20261011000100` → `20261011000000`. Rollback de código: deployment anterior da Vercel (`3931854`); o código antigo é compatível com o banco novo (`billing_compat_old_code`), então reverter código não exige reverter banco.

## 16. Riscos residuais (por prioridade)

1. **Concorrência real não provada** (`BLOCKED`, falta service-role do TEST).
2. **Runtime autenticado do Preview e painel `/admin` em navegador** (`NOT VERIFIED`; SSO da Vercel + variáveis TEST/Clerk Development a cargo do dono).
3. **EvoPay real** (`NOT VERIFIED`; sem sandbox; falha fechado).
4. **Deriva legada TEST × Production** não explicada (item 10.4).
5. Termos de Uso e Política de Privacidade em `1.0.0-rc.2` com marcadores `[BLOCKED — DADO EMPRESARIAL NECESSÁRIO]`/`[VALIDAÇÃO JURÍDICA NECESSÁRIA]` (razão social, CNPJ, endereço, e-mail de privacidade/DPO, foro, revisão jurídica) — **não publicar como versão final**.
6. Convite Clerk não implementado.
7. O PR #33 agrega 07 + 07.1 + 08 (revisão em bloco).

## 17. Próximos passos recomendados (decisão do usuário)

1. Fornecer a service-role **do TEST** em `.env.local` (ou executar `npm run test:integration:billing` em ambiente isolado) para fechar a prova de concorrência.
2. Configurar o Preview com Supabase **TEST** + Clerk Development (nunca credenciais de Production) e testar `/admin` com sessão real; executar o T10.
3. Repetir a comparação de fingerprints TEST × Production e a prova de rollback imediatamente antes do Go-Live.
4. Se aprovado: aplicar as 5 migrations em Production **uma por vez**, na ordem acima, **antes** do merge (merge commit, sem squash) e do deploy; depois smoke somente-leitura e conferência de que pagamentos/assinaturas/entitlements ficaram iguais.
5. Fornecer os dados empresariais e a revisão jurídica para publicar a versão final dos documentos legais.

## 18. Production — confirmação explícita

Não houve **merge**, **migration**, **deploy** nem **SQL de escrita** em Production. Production foi apenas **lida** (contagens, versões de migrations, fingerprints). O único comando de escrita executado em Production na sessão anterior (tentativa de `apply_migration`) foi **negado pela ferramenta** e não teve efeito; conferido novamente: 71 migrations, sem `lifetime`, 0 pagamentos.

---

# Anexo — relatório anterior (Go-Live tentado e bloqueado), preservado

> *Registro histórico do que foi escrito antes desta revisão. Itens superados: o veredito "BLOQUEADO" referia-se à negação de permissão para aplicar migrations em Production (ainda válida: nada foi publicado); "billing 65" foi corrigido para 69; "identidade 22" para 21; a bateria de membros passou de 44 para 50.*

## (anexo) Missão 08 — Admin Control Center completo + Release Go Live

Data: 2026-10-13 · Branch `feat/mission-08-admin-control-center` · PR [bartolomeu7/saas-project#33](https://github.com/bartolomeu7/saas-project/pull/33) · Versão dos documentos legais mantida: `1.0.0-rc.2`.

## Veredito

**ADMIN CONTROL CENTER GO LIVE BLOQUEADO — por autorização de publicação, não por defeito técnico conhecido.**

O código e as 5 migrations estão prontos, validados em TEST e com rollback provado, e o CI (Node 22) e o Preview da Vercel do PR #33 passaram. A aplicação das migrations em **Production foi negada pelo classificador de permissões da ferramenta (`[Production Deploy]`)** na primeira tentativa (`billing_hardening`). Conforme a regra da missão ("não contorne bloqueios de acesso ou publicação"), **nada foi aplicado em Production, o PR não foi mergeado e não houve deploy**. Production segue exatamente no estado anterior (ver seção E).

Para concluir: o dono precisa liberar a ferramenta (regra de permissão para `apply_migration` no projeto Supabase de Production) **ou** aplicar as migrations pelo SQL editor / CLI na ordem da seção E.3 e então pedir a continuação (merge + verificação).

---

## A. Inventário do Admin (por rota e ação)

Legenda: FUNCIONAL = implementado e validado por bateria SQL em TEST + typecheck/lint/build; PARCIAL; AUSENTE.
*Nenhuma rota foi exercitada em navegador autenticado como admin* (sem sessão Clerk disponível); a validação de servidor é por RPC com JWT simulado em TEST. Os diálogos novos foram verificados em harness local (temporário, removido).

| Rota | Estado | Ações |
|---|---|---|
| `/admin` (visão geral) | FUNCIONAL | KPIs, lifetime fora do MRR, recebido EvoPay 30d, estornos |
| `/admin/users`, `/admin/users/[id]` | FUNCIONAL | status, papel, perfil, alterar papel por e-mail, acesso, plano, pagamento manual, histórico |
| `/admin/companies`, `/admin/companies/[id]` | FUNCIONAL | editar, status, **licença unificada**, plano, reativar, cancelar, ajustar vencimento, pagamento manual, sincronizar, **equipe** (adicionar/papel/remover), **transferir propriedade** (super_admin) |
| `/admin/subscriptions` | FUNCIONAL | lista com “Vitalício”, filtros, vencendo |
| `/admin/payments`, `/admin/payments/[id]` | FUNCIONAL | reverificar no EvoPay, anular manual, **reconciliar pendentes** |
| `/admin/plans` | FUNCIONAL | criar/editar/ativar; plano `LIFETIME` protegido (sem preço/duração) |
| `/admin/administrators` | FUNCIONAL | promover/rebaixar; último super_admin protegido (RPC) |
| `/admin/audit` | FUNCIONAL | trilha de auditoria |
| `/admin/tools` | FUNCIONAL | diagnóstico (14 checks), marcar vencidas, sincronizar |
| `/admin/integrations` | FUNCIONAL | entregas de webhook (somente leitura) |
| `/admin/settings` | FUNCIONAL | configurações da plataforma (ex.: `admin_max_free_days`) |
| **Convidar/criar usuário via API oficial do Clerk** | **AUSENTE** | Não implementado nesta missão (exigiria `CLERK_SECRET_KEY` e fluxo próprio). Documentado como funcionalidade incompleta; hoje o admin vincula perfis **existentes** à empresa. |

## B. Licenças e acesso

Detalhes em [`docs/license-and-lifetime.md`](../license-and-lifetime.md). Resumo:

- 30 dias, período do plano (31/93/365 lidos do plano real), personalizado (1–365) e **vitalício real** (`expires_at IS NULL ⇔ lifetime`, sem data fictícia).
- Admin: ≤ `admin_max_free_days` (30) sem pagamento; super_admin ≤ 365; vitalício só super_admin. O mesmo limite agora vale em atribuir plano/reativar (**correção de brecha** que dava o prazo cheio do plano a um admin comum).
- Motivo obrigatório + confirmação na UI + auditoria; atômico e idempotente por `request_key` (reexecução devolve `replayed: true`).
- Pagamento manual: “liberar acesso” (exige valor > 0) vs “apenas documentar”; diagnóstico `manual_payment_below_price`.
- Vitalício: fora de MRR/“vencendo”, não expira, não aceita estender/ajustar; Pix sobre vitalício registra o pagamento sem alterar o acesso.
- Regra única de acesso (SQL `subscription_access_active()` e TS `access.ts`), falha fechado.

## C. Billing / EvoPay

- Cobrança idempotente (índice parcial único + `claim_subscription_payment`), confirmação só com valor do provedor == valor esperado, estorno terminal, `pending` tardio não rebaixa.
- Payload do provedor minimizado antes de persistir (sem dados do pagador/QR Code).
- Reconciliação usa apenas o endpoint documentado `GET /pix?id=`; webhook sem assinatura e 1 tentativa (limitação do provedor) → compensado pela reconciliação manual.
- **Risco externo não eliminado:** o contrato real da EvoPay (semântica do campo valor) não pôde ser exercitado (sem sandbox, proibido cobrar de verdade). O código **falha fechado**: valor ausente/divergente ⇒ não concede acesso.

## D. Segurança

- RLS/isolamento: bateria `tenant_isolation.sql` (+4 sondas novas: licença, membros, chaves de operação) → 0 vazamentos.
- Funções novas com `revoke … from public, anon` (+ `authenticated` nas internas); privilégios mínimos (migration `20261011000100`).
- Último super_admin protegido; transferência de propriedade mantém exatamente 1 owner; membros limitados pelo entitlement `max_additional_users`.
- Barreira central de consentimento (Missão 07) mantida; documentos legais **não** foram alterados nem publicados como versão final.
- Nenhum segredo lido/impresso/commitado; nenhuma credencial de Production usada em TEST.

## E. CI, infraestrutura e deploy

### E.1 CI / Preview
- GitHub Actions `verify` (Node 22: lint, typecheck, testes unitários, build): **success** — run [38477286803](https://github.com/bartolomeu7/saas-project/actions/runs/38477286803).
- Vercel Preview do PR #33: **build concluído** ("Deployment has completed"). O runtime do Preview **não foi testado** (SSO da Vercel e variáveis TEST/Clerk Development a criar pelo dono; não contornado).
- `integration/billing-concurrency.mjs` (S1–S10): **BLOQUEADO** — requer chave service-role do TEST em `.env.local` (não disponível). A concorrência financeira real **não foi provada**; só a serialização por lock/PK (SQL) e a idempotência sequencial.

### E.2 Testes (evidências em TEST, transação revertida)
| Bateria | Resultado |
|---|---|
| `tests/sql/license_ops.sql` (licenças/vitalício/idempotência/políticas) | 96/96 |
| `tests/sql/company_members_reconcile.sql` | 44/44 |
| `tests/sql/admin_platform.sql` (Admin/RBAC, diag 14) | 299 checks, ok |
| `tests/sql/billing_confirm.sql` | ok (65 na última execução completa registrada no PR) |
| `tests/sql/tenant_isolation.sql` | 0 vazamentos |
| `tests/sql/billing_compat_old_code.sql` | código antigo × banco novo ok |
| Unitários (`tests/unit`, inclui `access` e `evopay-contract`) | 81 ok |
| Rollback (`build-rollback-test.mjs`) | down scripts aplicados em TEST e catálogo comparado com Production: igual |
| Baterias legal (73) e identidade (22) | **não reexecutadas** nesta missão (sem mudança nessas áreas; última execução: Missão 07) |

### E.3 Estado de Production (somente leitura, 2026-10-13) e plano de publicação
Baseline antes de qualquer publicação (nada mudou):

- Migrations: 71, última `20261008202401`; sem coluna `subscriptions.lifetime`.
- 0 pagamentos · 1 assinatura (`trialing`, vence 2026-10-17) · 2 perfis · 1 empresa · 1 entitlement · 1 super_admin ativo.
- Impressões digitais (colunas centrais, sem as novas): subscriptions `d7798c0a8526d2999e6f3c506a7fea63`, entitlements `2bd9decdc5a185a3988b4b6cb35ab88c`.
- Pré-checks já feitos: 28/28 padrões das reescritas guiadas casam com o texto das funções de Production; catálogo de planos conferido.

**Ordem segura (migrations ANTES do deploy; código antigo é compatível com o banco novo, código novo exige o banco novo):**
1. `20261011000000_billing_hardening.sql`
2. `20261011000100_privilege_minimization.sql`
3. `20261012000000_lifetime_access_and_license_ops.sql`
4. `20261012000100_plans_lifetime_awareness.sql`
5. `20261012000200_admin_company_members_and_reconciliation.sql`
6. Merge do PR #33 **com merge commit** (sem squash) → deploy automático da Vercel.

Após cada migration: contagens acima inalteradas, fingerprints de subscriptions/entitlements iguais, `platform_diagnostics` sem `error`. Depois do deploy: aguardar READY, smoke somente-leitura (home/legal/planos 200; `/app` e `/admin` 307 para login; `POST /api/billing/create-payment` sem sessão 401), confirmar o commit publicado e que pagamentos/assinaturas/entitlements seguem iguais.

**Rollback:** `supabase/rollback/` — ordem `20261012000200` → `…000100` → `…000000` → `20261011000100` → `20261011000000`. O de `…000000` recusa rodar se existir acesso vitalício (converter antes). Código: reverter para o deployment anterior da Vercel (commit `3931854`); como o código antigo é compatível com o banco novo, o rollback de código não exige rollback de banco.

### E.4 Tentativa de publicação (resultado)
`apply_migration(billing_hardening)` em `fpbcruinppjbwtinzrdg` → **negada** pelo classificador (`[Production Deploy]`). Nada foi executado; reverificado depois: Production inalterada. Não houve tentativa de contorno.

## F. Alterações

- Migrations (aplicadas **só em TEST**): `20261011000000`, `20261011000100`, `20261012000000`, `20261012000100`, `20261012000200`.
- Rollbacks: `supabase/rollback/*.down.sql` + `build-down-20261012.mjs`.
- Código: `src/lib/billing/{access,payload,guard,confirm-payment,queries}.ts`, `src/lib/admin/{actions,queries}.ts`, componentes `src/components/admin/*` (licença, equipe, request key, partes de detalhe), páginas de `/admin` e `/app/assinatura`, tipos.
- Testes: `tests/sql/*`, `tests/unit/{access,evopay-contract}.test.mjs`, `tests/integration/billing-concurrency.mjs`.
- Docs: `docs/license-and-lifetime.md`, `docs/billing-hardening.md`, `docs/ci-and-environments.md`, `src/app/admin/README.md`, este relatório.
- Branch/PR: `feat/mission-08-admin-control-center` → #33 (aberto). Commits desta missão: `f5a5010`, `1c54849`, `18a05c2`, `6ba83f4`, `67f9615` (+ este relatório). Merge commit / deployment id: **não se aplica (não publicado)**.
- `b.txt` (não rastreado) preservado. Harness temporário `src/app/dev-harness` removido antes do commit.

## G. Pendências (classificadas)

| Item | Classe |
|---|---|
| Aplicar 5 migrations em Production, mergear #33 e fazer o smoke | **Corrigido, não publicado** (bloqueio de autorização da ferramenta) |
| Convite/criação de usuário pela API oficial do Clerk | **Funcionalidade incompleta** |
| Concorrência financeira real (S1–S10) | **Teste bloqueado** (falta chave service-role do TEST) |
| Preview em runtime (SSO, variáveis TEST + Clerk Development) | **Teste bloqueado** (configuração do dono; não contornada) |
| Teste autenticado do Admin no navegador (sem sessão Clerk) | **Teste bloqueado** |
| Contrato real da EvoPay (valor/webhook/estorno) | **Risco externo** (falha fechado) |
| Revisão jurídica e dados da empresa nos Termos/Política (`rc.2`) | **Dado empresarial / revisão jurídica** |
| Reexecutar baterias legal (73) e identidade (22) | Baixo risco; recomendável antes/depois do Go Live |

## H. Decisão

O risco técnico residual (concorrência real e Preview em runtime não provados, Admin não exercitado com sessão real) é mitigado por: serialização em banco (lock + PK), falha fechado, idempotência por chave, rollback provado e baseline de Production pequeno (1 empresa, 0 pagamentos). Na minha avaliação isso permitiria **GO LIVE VALIDADO COM RESSALVAS**, **se** a publicação fosse autorizada; como a ferramenta negou a publicação em Production, o veredito é **BLOQUEADO** até a liberação.
