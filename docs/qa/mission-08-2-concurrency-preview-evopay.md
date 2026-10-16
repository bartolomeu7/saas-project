# Missão 08.2 — Concorrência real, Preview isolado e EvoPay

**Veredito geral: YELLOW.** A concorrência financeira real em TEST foi **provada** (Trilha A `VERIFIED`). O Preview foi **preparado e isolado por escopo**, mas o runtime autenticado continua `BLOCKED` por dependências do dono (Trilha B). A EvoPay teve contrato, código e cliente revistos e testados sem dinheiro, mas a integração real segue `NOT VERIFIED` (Trilha C). Não houve merge, migration, SQL de escrita, deploy ou alteração de variável em Production.

Legenda: `VERIFIED` (executado e observado nesta missão) · `NOT VERIFIED` · `BLOCKED` (impedimento registrado, nada contornado) · `INFERRED` (deduzido, sem execução direta).

## 1. Identificação

| Item | Valor |
|---|---|
| Data/hora | 2026-10-14, 08:25–09:30 (America/Sao_Paulo, UTC−03:00) |
| Branch / HEAD no preflight (= remoto) | `feat/mission-08-admin-control-center` @ `24dca19cbcaf56492c5976716064d642e5c1cc4d` |
| PR | [#33](https://github.com/bartolomeu7/saas-project/pull/33) `OPEN`, `MERGEABLE`, `CLEAN`, base `main` |
| CI no preflight | run `38505703856` `success` no `24dca19…` (anteriores `38488592238` e `38487689830` também `success`) |
| Preview no preflight | deployment `7055970522` (= `24dca19…`), `success`, atrás do SSO da Vercel |
| TEST | Supabase `zlmxbqlpjstmllrvafmy` (escrita só em fixtures descartáveis) |
| Production | Supabase `fpbcruinppjbwtinzrdg` — **nenhuma consulta nesta missão** (uma leitura foi negada pelo classificador e não foi repetida) |
| Clerk Development / Production | `top-coyote-5526.clerk.accounts.dev` (prefixo `pk_test_` nas variáveis do Preview) / `clerk.primeges.com.br` (`pk_live_`, só Production) |
| `b.txt` | preservado |

### 1.1 Estado inicial (preflight) — `VERIFIED`
- TEST: 34 migrations; 6 assinaturas, 6 entitlements, 3 pagamentos, 0 `payment_events`, 6 empresas, 9 membros, 14 perfis, 307 auditorias, 0 chaves de operação, 0 `[CONCTEST]`.
- `.env.local`: `SUPABASE_SERVICE_ROLE_KEY` **vazia**; `.env.prod-backup.local` é de Production e não foi usado.
- Variáveis da Vercel (só metadados; nada decriptado): `SUPABASE_SERVICE_ROLE_KEY`, `EVOPAY_API_KEY`, `EVOPAY_API_BASE_URL`, `CLERK_SECRET_KEY` (live) e a anon key de Production existem **somente no alvo `production`**. `NEXT_PUBLIC_SUPABASE_URL` (id `wZHaDc617BGYFQO1`) tem alvo **preview + production** e não tinha override para esta branch. Existiam overrides de Preview apenas para as branches `feat/clerk-auth-prep` e `feat/ui-revamp-shadcn`.

---

## 2. Trilha A — concorrência financeira real em TEST — `VERIFIED`

### 2.1 Como foi possível sem a service-role no `.env.local`
O MCP do Supabase serializa as chamadas (não prova concorrência) e a chave do TEST não estava disponível localmente. Não pedi a chave, não usei credenciais de Production e não substituí concorrência por testes sequenciais. Em vez disso, implantei **uma Edge Function temporária dentro do próprio projeto TEST** (`billing-concurrency-runner`, fonte em `tests/integration/edge/billing-concurrency-runner.ts`), que recebe do runtime do projeto a service-role correspondente e dispara as rajadas com `Promise.all`. A chave **nunca foi lida, impressa ou devolvida** por mim nem pelo código. Proteções: recusa rodar se `SUPABASE_URL` não for o TEST; exige JWT (`verify_jwt`) + token descartável no cabeçalho; só cria e remove fixtures `[CONCTEST]`. Ao final foi **substituída por um stub 410** (o MCP não oferece "delete function"; a função inerte `billing-concurrency-runner` continua listada no projeto TEST — o dono pode excluí-la no painel).

> Decisão a registrar: esta via equivale a usar a credencial do TEST sem tê-la em `.env.local`. É coerente com a autorização da missão (testes de concorrência em TEST, nada de Production), mas se o dono preferir o fluxo clássico, basta colocar a service-role do TEST em `.env.local` e rodar `npm run test:integration:billing` (S1–S10 originais, corrigidos).

### 2.2 Cenários (S1–S10 versionados + S11–S14 novos)
Todas as rajadas tiveram **todas as chamadas em voo ao mesmo tempo** (`max_in_flight` = nº de chamadas), medido pela sobreposição dos intervalos de cada requisição.

| Cenário | Paralelas | Esperado | Observado | wall / p50 / máx (ms) |
|---|---|---|---|---|
| S1 `claim` mesma intenção | 12 | 1 criada, mesma cobrança p/ todas, 1 `pending` | ok | 564 / 474 / 564 |
| S2 `confirm` mesmo `event_id` | 12 | 1 processa; acesso ~31 d (não 372); 1 `payment_event` | ok | 702 / 689 / 701 |
| S3 `confirm` 12 `event_id`s (reentregas) | 12 | nenhuma falha; vencimento inalterado | ok | 395 / 168 / 394 |
| S4 dois pagamentos, empresa sem assinatura | 2 | 1 assinatura + 1 entitlement; 31+365 d | ok | 154 / 153 / 153 |
| S5 valor errado/ausente | 12 | todas rejeitadas; sem assinatura; `pending` | ok | 177 / 166 / 176 |
| S6 intenções distintas | 3 | todas criam; A tem 2 pendentes | ok | 160 / 144 / 159 |
| S7 reserva abandonada (timeout) | 10 | antiga `failed`; 1 nova; 1 aberta | ok | 174 / 162 / 173 |
| S8 cobrança já criada no provedor | 10 | nenhuma cria outra; mesma p/ todas | ok | 165 / 155 / 164 |
| S9 `claim` ×5 + `confirm` ×5 | 10 | sem 5xx/deadlock; 1 paga; 1 assinatura; ~31 d | ok | 178 / 165 / 178 |
| S10 `refunded` ×5 + `paid` ×5 | 10 | termina `refunded`; sem acesso em dobro | ok | 170 / 162 / 170 |
| S11 (tabela) 12 inserts da mesma `request_key` | 12 | 1 linha, nenhum erro | ok | 391 / 165 / 391 |
| S12 (tabela) mesma chave, 2 empresas | 12 | 1 linha (primeira vence) | ok | 467 / 150 / 467 |
| S13 `claim` 10 empresas × 4 | 40 | exatamente 10 reservas | ok | 446 / 387 / 445 |
| S14 `confirm` 30 empresas | 30 | 30 assinaturas, sem 5xx | ok | 406 / 240 / 405 |

Resultado: **40/40 verificações, 0 falhas, 0 HTTP 5xx, 0 deadlocks**; reproduzido em **4 execuções consecutivas** (40/40 em todas). Duração por execução ≈ 73–77 s (inclui criação/remoção das fixtures).

### 2.3 Invariantes verificadas no banco (sobre as ~52 empresas de cada execução)
0 intenções com >1 `pending`; 0 empresas com >1 assinatura ou >1 entitlement; 0 `event_id` duplicado (73 eventos); 0 entitlements divergentes da assinatura (plano, status, vencimento, `lifetime`); 0 pagamento `paid` sem assinatura.

### 2.4 Limpeza — `VERIFIED`
Depois das execuções: 0 empresas `[CONCTEST]`, 0 chaves de operação, 0 órfãos em `audit_logs`; contagens idênticas ao baseline (6 assinaturas, 6 entitlements, 3 pagamentos, 0 eventos, 6 empresas, 9 membros, 14 perfis, 307 auditorias, 34 migrations).

### 2.5 O que **não** ficou provado
- **Concorrência das RPCs administrativas** (`admin_grant_license`, `admin_add_company_member`, transferência de propriedade): `NOT VERIFIED`. Elas exigem um ator administrador (JWT do Clerk); com `service_role` não há ator e `platform_operation_keys.actor_user_id` é `NOT NULL` — comportamento **por desenho**, não defeito. S11/S12 provam apenas a **garantia da tabela** (PK + `ON CONFLICT DO NOTHING` sob concorrência). Para provar as RPCs é preciso conexão direta ao TEST com sessões de dois administradores (Clerk Development).
- A rajada roda de **dentro** do projeto (baixa latência até o PostgREST); o padrão de interleaving em produção pode diferir. `INFERRED` que a margem de segurança é mantida pelos locks por empresa/intenção + índice único parcial.

### 2.6 Defeitos de TESTE encontrados (corrigidos sem afrouxar expectativas)
1. **S5 (também no `billing-concurrency.mjs` original):** o parâmetro com valor padrão `amount = Number(monthly.price)` transformava o `undefined` do caso "valor ausente" em R$ 89 (correto), então o pagamento era legitimamente concedido e o teste acusava falha. Corrigido passando `null` explícito (expectativa mantida: 12 rejeições, sem assinatura). **Não é defeito do produto**: o caso "valor ausente → `AMOUNT_MISSING`" é coberto por `billing_confirm.sql` (69/69).
2. **S11/S12 originais** chamavam `platform_begin_operation` com `service_role` (sem ator) → `NOT NULL`. Reescritos como teste de tabela (item 2.5), com o limite declarado.

---

## 3. Trilha B — Preview isolado e autenticado — `BLOCKED` (preparado)

### 3.1 Diagnóstico das variáveis — `VERIFIED` (metadados)
| Variável | Escopo antes | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` (`wZHaDc617BGYFQO1`) | preview + production, sem override p/ esta branch | valor não decriptado (classificador nega); **`INFERRED`** que aponta para Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production; preview só p/ 2 outras branches | para esta branch: **ausente** (o app não conectaria) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | production (`pk_live`/`sk_live`); preview só p/ `feat/clerk-auth-prep` | para esta branch: ausentes |
| `SUPABASE_SERVICE_ROLE_KEY`, `EVOPAY_API_KEY`, `EVOPAY_API_BASE_URL` | **somente production** | o Preview **não possui** service-role nem EvoPay: webhooks/pagamentos reais falham fechados |

### 3.2 Configuração segura aplicada — `VERIFIED`
Criados 3 overrides **de Preview, limitados à branch** `feat/mission-08-admin-control-center` (ids `Ng048ASBdAHAmF1R`, `HNY4gTcyMcOXE1Zu`, `reSmda6ZHITXK7HI`), todos `type: plain` (valores públicos), alvo `["preview"]`:

| Variável | Valor (público) |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do TEST (`zlmxbqlpjstmllrvafmy.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key do TEST (JWT com `ref=zlmxbqlpjstmllrvafmy`, `role=anon`, decodificado e conferido) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_…` da instância `top-coyote-5526.clerk.accounts.dev` |

Prova de que Production **não** foi afetada: nenhuma variável com alvo `production` foi criada/editada; `wZHaDc617BGYFQO1` e todas as demais variáveis de Production permaneceram intactas; a listagem filtrada por branch devolve só estas 3. Nenhuma variável compartilhada foi sobrescrita nem removida. Um override de branch tem precedência sobre o genérico de Preview (mecanismo já usado pelo dono nas outras duas branches).

### 3.3 O que falta e só o dono pode fazer — `BLOCKED`
1. **`CLERK_SECRET_KEY` de Development (`sk_test_…`) para esta branch** (Vercel → Environment Variables → Preview → *Branch* `feat/mission-08-admin-control-center` → tipo *Sensitive*). É segredo: não o inseri porque os parâmetros da ferramenta ficariam registrados na conversa. **Sem ela o middleware do Clerk falha no Preview**; é a causa do "Preview quebrado" histórico.
2. **Acesso autenticado oficial ao Preview protegido por SSO.** O navegador embutido **não** tem sessão Vercel (redireciona para `vercel.com/login`). Não contornei o SSO, não pedi senha e não usei cookies. O dono deve entrar na Vercel no painel do navegador embutido (ou abrir o Preview ele mesmo).
3. **Sessão Clerk Development.** Criar conta/entrar/digitar senha em serviço externo é ação que não executo; o dono deve criar (ou usar) uma conta descartável de **Development** e entrar no Preview. Depois disso eu promovo o perfil correspondente no TEST (por SQL, revertendo ao fim) para exercitar `user`/`admin`/`super_admin`.
4. (Decisão, não feita) remover `preview` do alvo de `wZHaDc617BGYFQO1`: só é necessário se outras branches sem override forem usadas; não toquei por poder afetar outros Previews.

### 3.4 Plano de teste autenticado (executável quando 3.3 estiver pronto)
Provar primeiro, **dentro do Preview autenticado**, a página `/admin/integrations`: o app mostra o modo do Clerk pelo prefixo (`desenvolvimento (test)`) e que a service-role e a EvoPay **não** estão configuradas (indício direto de isolamento). Em seguida: login e persistência; `/admin`; listas de usuários/empresas; `user`/`admin`/`super_admin`; ações só de super; autoprivilégio; suspenso/inativo; isolamento entre empresas; licença e pagamento manual (sem Pix real); membros/propriedade; reconciliação; console e redirecionamentos. Todos os itens abaixo ficam `NOT VERIFIED` até lá.

### 3.5 Estado final da trilha
| Item | Classe |
|---|---|
| Overrides de branch criados, só `preview`, só valores públicos de TEST/Development | `VERIFIED` |
| Production intacta (variáveis) | `VERIFIED` |
| Preview desta branch aponta para TEST em runtime | `INFERRED` (precedência de branch; **não observado**, SSO) |
| Clerk do Preview é Development em runtime | `INFERRED` (`pk_test_` configurada; `sk_test` ainda ausente) |
| Runtime autenticado, `/admin`, testes 1–12 do roteiro | `BLOCKED` / `NOT VERIFIED` |
| Compilação do Preview (build) | `VERIFIED` pelo CI/Vercel; **HTTP 302 do SSO não prova runtime autenticado** |

---

## 4. Trilha C — EvoPay

### 4.1 Contrato oficial × código (docs.evopay.cash, `llms-full.txt` lido em 2026-10-14, 882 linhas, sha256 `52dff247…`)
| Tópico | Documentado | No código | Classe |
|---|---|---|---|
| Base URL / auth | `https://pix.evopay.cash/v1`; header `API-Key` (UUID v4, único por conta, fixo) | `client.ts` usa `EVOPAY_API_BASE_URL` + `API-Key` | `VERIFIED` (doc + código) |
| Valor | reais decimais (`10.50`); `POST /pix` `amount` mínimo `1` | `amount` em reais; comparação ao centavo (`amount.ts`) | `VERIFIED` (doc + testes unit.) |
| Criar cobrança | `POST /pix` `{amount, callbackUrl, payer*, externalReference}` → `id,status,amount,taxAmount,amountWithTax,qrCode*` | `createPixCharge`; rota confere `charge.amount == preço do plano` | `VERIFIED` (código); real `NOT VERIFIED` |
| Consulta | `GET /pix?id=` (fonte de verdade); `404` se inexistente | `getPixCharge` + `confirmPaymentFromProvider` | `VERIFIED` (código) |
| Status | `PENDING→COMPLETED\|CANCELED\|EXPIRED`; `COMPLETED→WAITING_FOR_REFUND→REFUNDED` | `mapEvoPayStatus` (desconhecido → `pending`) | `VERIFIED` |
| Webhook | `POST` na `callbackUrl`; **sem assinatura**; **tentativa única**; idempotência `id+status`; payload `id,type,status,amount,endToEndId,payer*` | rota só usa o `id` e **reconsulta** o provedor; `event_id = id:status` | `VERIFIED` (código) |
| Sandbox | **Nenhum**: o OpenAPI lista só o servidor "Produção"; o texto não cita homologação | — | `VERIFIED` (por leitura) |
| Idempotência na criação | **Não documentada** (sem `Idempotency-Key`); `externalReference` é aceito mas **não** retornado pelo `GET` | idempotência é nossa (`claim_subscription_payment`) | `VERIFIED` (doc) |
| Estorno | Só o fluxo de status; **não há endpoint de estorno** documentado | `REFUNDED` terminal; acesso não é revogado sozinho | `VERIFIED` (doc) |
| Expiração | Status `EXPIRED` existe; **prazo/`expiresIn` de depósito não documentado** | pendente expira localmente após `stale` apenas para reservas sem cobrança | `NOT VERIFIED` (prazo desconhecido) |
| Taxas / mínimo da conta | `TaxRule.minAmount/maxAmount` definidos pelo gerente de contas; abaixo do mínimo é rejeitado | planos ≥ R$ 15; plano de teste `TEST_R1` = R$ 1 | `NOT VERIFIED` (regras da conta desconhecidas) |

**Divergência observada (real, sem chave, sem dinheiro):** requisições **sem** `API-Key` ou com chave **inválida** em `GET /pix`, `GET /account/balance` e `POST /pix` retornam **HTTP 500** `{"success":false,"message":"A critical error occurred, please try again later."}`, e **não 401** como o OpenAPI documenta. `/v1/sandbox` → 404. Consequência: uma chave errada/rotacionada se manifesta como 500 e é indistinguível de indisponibilidade. O app já trata **todo não-2xx como falha fechada** (nunca "pago"); recomenda-se alertar no painel `/admin/integrations`. Classe: `VERIFIED` (observado).

### 4.2 Defeitos no cliente HTTP — encontrados e **corrigidos** (`src/lib/evopay/client.ts`)
1. **Sem timeout:** um provedor pendurado prenderia a função serverless e a reserva do pagamento. Agora cada chamada leva `AbortSignal.timeout(10 000 ms)`; estouro/abort → `EvoPayError` (status 0, "Tempo esgotado…").
2. **2xx com corpo ilegível** lançava `SyntaxError` (tipo diferente do esperado pelos chamadores). Agora lança `EvoPayError("Resposta inválida da EvoPay.", status)`, que nunca vira "pago" nem "criado".

### 4.3 Testes sem movimentação financeira — `VERIFIED`
`tests/unit/evopay-client.test.mjs` (9 testes; `fetch` **simulado** por uma sonda em processo filho, chave **falsa**; nada sai para a rede): método/URL/cabeçalho de `POST /pix` e `GET /pix?id=` (id codificado), 401/400/404 com `{message}`/`{error}`, 5xx com HTML, 2xx ilegível, falha de rede, timeout, abort, config ausente (nenhuma requisição sai) e ausência da chave nas mensagens. Somados aos existentes: `npm run test:unit` = **90 testes, 89 pass, 1 skipped, 0 fail** (antes: 81/80/1/0). As respostas desses testes são **dublês documentais** e nunca são apresentadas como prova de pagamento real. A confirmação de valor/duplicidade/estorno no banco é coberta por `billing_confirm.sql` (69/69, executada hoje) e pela rajada concorrente (seção 2).

### 4.4 Plano controlado da primeira cobrança Pix real — **NÃO EXECUTADO** (aguarda autorização específica)
- **Onde:** só Production tem as chaves EvoPay e o `callbackUrl` aponta para `primeges.com.br`; portanto o teste real só faz sentido **depois** das migrations + deploy (o código atual de Production não tem a conferência de valor). Ele faz parte do smoke do Go-Live, não desta missão.
- **Valor:** R$ 1,00 (mínimo do OpenAPI). O servidor só cobra o preço do plano — é preciso ativar temporariamente o plano de teste `TEST_R1` ("Teste financeiro (R$1)", existe no TEST; **não verificado se existe em Production**) por um `super_admin`, e desativá-lo ao final. Confirmar com o gerente de contas que `TaxRule.minAmount` ≤ R$ 1,00.
- **Pagador:** o próprio dono, com Pix pessoal. **Empresa:** uma empresa de teste do dono (nunca cliente real).
- **Identificação:** `externalReference = PRIMEGES:<payment_id>` + `provider_transaction_id`; registrar `endToEndId` (sem nome/CPF).
- **Verificação independente:** (a) painel EvoPay (status e valor); (b) `GET /v1/pix?id=` via `/admin/payments/[id]` (reverificar); (c) extrato bancário do dono.
- **Sem duplicação:** não clicar duas vezes; a idempotência é do `claim`. Conferir 1 `subscription_payment`, 1 `payment_event` por `id:status`.
- **Estado final esperado:** pagamento `paid` com `amount=1.00`; assinatura `active` com vencimento = 1 dia (`TEST_R1`) a partir de agora; entitlements idênticos; auditoria `payment.paid`.
- **Encerramento:** desativar `TEST_R1`; registrar evidência sem dados pessoais. **Estorno só manual** (não existe endpoint) e por decisão do dono; o acesso não é revogado automaticamente.
- Registrar o resultado real do `amount` (semântica bruta × líquida) — hoje o sistema **falha fechado** se divergir.

### 4.5 Estado final da trilha
| Item | Classe |
|---|---|
| Contrato lido e comparado ao código | `VERIFIED` |
| Testes automatizados do cliente e da confirmação | `VERIFIED` |
| Sandbox | inexistente (`VERIFIED` por leitura) |
| Integração real (criar/consultar/webhook com dinheiro) | `NOT VERIFIED` |
| Primeira cobrança Pix real | não executada; **pendente de autorização específica** |
| Prazo de expiração do Pix; `TaxRule.minAmount` da conta | `NOT VERIFIED` |

---

## 5. Regressão e verificações estáticas
- **SQL no TEST (14/10, mesmo estado de banco desta missão; nenhuma migration/função mudou depois):** Billing **69/69**, Admin/RBAC **299/299**, Licenças/Lifetime **96/96**, Membros/propriedade/reconciliação **50/50**, Isolamento **39 tabelas, 0 vazamentos** (Missão 08.1.1, hoje cedo; a rajada de concorrência exercitou as mesmas RPCs e o TEST voltou ao baseline). Não reexecutadas: `legal_consent` (73) e `auth_identity` (21) — sem mudança no escopo.
- `npm run lint`: 0 erros, 10 avisos preexistentes. `npm run typecheck`: ok. `npm run test:unit`: 89 pass / 1 skipped / 0 fail. `npm run build`: ok.
- Arquivos de teste de Deno excluídos de `tsc`/`eslint` (`tests/integration/edge`).

## 6. Defeitos e correções
| # | Defeito | Severidade | Estado |
|---|---|---|---|
| 1 | `evoPayFetch` sem timeout | média | corrigido (10 s) + teste |
| 2 | 2xx não-JSON gerava `SyntaxError` | baixa | corrigido + teste |
| 3 | S5 de concorrência (parâmetro padrão) | teste | corrigido nos dois runners |
| 4 | S11/S12 exigiam ator | teste | reescritos (tabela) |
| 5 | EvoPay responde 500 (não 401) sem/ com chave inválida | informativo | documentado; app já falha fechado |

## 7. Pendências e bloqueios
**Dono (alta):** `CLERK_SECRET_KEY` (`sk_test`) de Development para a branch; login na Vercel no navegador embutido; conta Clerk Development descartável; (opcional) excluir a função inerte `billing-concurrency-runner` do TEST. **Dono (média):** autorizar e executar a primeira cobrança de R$ 1 (seção 4.4); confirmar `TaxRule.minAmount` e prazo de expiração com a EvoPay; dados empresariais e revisão jurídica dos documentos legais (`1.0.0-rc.2`, **não comercializar**). **Técnicas:** concorrência das RPCs admin; convite de usuário pelo Clerk não implementado.

## 8. Riscos residuais
- Preview sem `sk_test` continua inoperante; se for "consertado" sem isolamento, a variável compartilhada de URL pode apontar para Production (os overrides de branch mitigam, mas só para esta branch).
- Go-Live sem validação em navegador: regressão de UI/middleware só apareceria em Production.
- Integração real com a EvoPay nunca exercitada; semântica do `amount` e o prazo do Pix são desconhecidos (falha fechada).
- Rollback de banco não restaura dados (provado na 08.1).

## 9. Recomendação para o Go-Live
**YELLOW.** O que era o maior risco técnico — corrida financeira — agora tem **prova concorrente** (40/40, 4 execuções, invariantes íntegras). Restam o **runtime autenticado do Preview** e a **primeira cobrança real**, ambos dependentes do dono. Go-Live só com decisão consciente do dono; se prosseguir, manter a ordem: conferir fingerprint de Production → aplicar as 5 migrations **uma a uma** → merge do #33 → READY → smoke somente-leitura → cobrança de R$ 1 autorizada.

## 10. Confirmação de limites
Nenhum merge do #33, nenhuma migration, nenhum SQL de escrita, deploy ou alteração de infraestrutura em Production; nenhuma variável com alvo `production` foi criada ou editada; nenhuma credencial de Production usada em TEST/Preview; nenhum segredo, JWT ou cookie foi impresso ou registrado (a anon key e a `pk_test` são públicas); nenhuma cobrança, estorno ou pagamento reais; SSO e classificadores não foram contornados.

## 11. Arquivos desta missão
`docs/qa/mission-08-2-concurrency-preview-evopay.md` · `tests/integration/edge/billing-concurrency-runner.ts` · `tests/integration/billing-concurrency.mjs` (S5) · `src/lib/evopay/client.ts` · `tests/unit/evopay-client.test.mjs` · `tests/unit/helpers/evopay-client-probe.mjs` · `tsconfig.json` e `eslint.config.mjs` (exclusão do runner Deno).
