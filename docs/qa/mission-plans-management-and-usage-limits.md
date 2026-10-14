# Missão PRIME GES — Administração de planos, preços, descontos, benefícios e limites de uso

Data: 2026-10-14 · Branch: `feat/plans-management-usage-limits` (empilhada sobre `feat/mission-08-admin-control-center` @ `274c7bc`) · Escopo: **somente TEST** (`zlmxbqlpjstmllrvafmy`).

Legenda: **VERIFIED** (executado e observado) · **NOT VERIFIED** (não executado) · **BLOCKED** (impedido por restrição/limite do ambiente) · **INFERRED** (deduzido do código/documentação, sem execução).

Documentação técnica: [`docs/plans-and-usage-limits.md`](../plans-and-usage-limits.md).

## 1. Resumo executivo

| Entrega | Status |
|---|---|
| Área **Planos** no Admin Control Center (lista, criar, editar, ativar/desativar, histórico, prévia pública) | VERIFIED no banco/RPC e nos testes unitários; tela autenticada **BLOCKED** (ver §9) |
| Preços/preço anterior/promoção/desconto calculado no backend (+ espelho TS com testes de paridade) | VERIFIED |
| Benefícios comerciais administráveis, separados de direitos reais | VERIFIED |
| Limite de vagas por plano, atômico (RPC + trigger), com concorrência real | VERIFIED |
| Limite de sessões simultâneas (3 padrão, configurável) | VERIFIED no banco (incl. concorrência); integração real com a API de sessões do Clerk **NOT VERIFIED** |
| Antifraude do teste grátis por conexão | VERIFIED no banco (incl. concorrência e cabeçalhos forjados em teste unitário); fluxo real de cadastro Clerk **BLOCKED** |
| Concessão idempotente do teste grátis | VERIFIED |
| Site público lendo o catálogo único (`get_public_plans`) | VERIFIED (testes + build); renderização autenticada **BLOCKED** |
| Rollback documentado **e provado** (down + replay) | VERIFIED (§7) |
| Production alterada | **Não** (§10) |

## 2. Diagnóstico inicial (Fase Zero)

* Base: `main` @ `06f4bd5`; trabalho empilhado em #33 (Missão 08, **não mergeada**) e 08.2.
* Já existiam: tabela `plans` com os 5 planos comerciais, RPCs `create_platform_plan`/`update_platform_plan`/`set_platform_plan_status`, `platform_settings` + `set_platform_setting`, `audit_logs`, `company_entitlements.max_additional_users`, RBAC (`is_platform_admin`/`is_super_admin`) e a página `/admin/plans` (lista simples). Auth: Clerk → JWT → Supabase third-party auth → `profiles.clerk_user_id` → `current_profile_user_id()`.
* Lacunas encontradas: (1) a home exibia planos de `src/config/marketing.ts` (texto fixo, fora do banco); (2) o limite de vagas só era checado dentro de duas RPCs — um INSERT direto em `company_members` o ignorava; (3) não havia limite de sessões; (4) `create_company_with_owner` concedia o teste a qualquer cadastro, sem antifraude; (5) não existia webhook do Clerk (impossível bloquear o signup no provedor a partir do app); (6) `claim_subscription_payment` aceitava plano de teste/preço ≤ 0 se o chamador enviasse o mesmo valor; (7) sem campos de preço anterior/promoção/benefícios.

## 3. Arquivos

**Novos**: `supabase/migrations/20261014000000_plans_management_and_usage_limits.sql`, `supabase/rollback/20261014000000_…down.sql`, `src/lib/billing/pricing-display.ts`, `src/lib/admin/plan-form.ts`, `src/lib/security/{client-ip,trial-signup}.ts`, `src/lib/auth/{session-gate,session-actions}.ts`, `src/lib/supabase/public.ts`, `src/app/acesso-sessoes/{page,revoke-session-button}.tsx`, `src/app/admin/plans/{plan-editor.tsx,new/,[id]/}`, `tests/sql/{plans_management,usage_limits}.sql`, `tests/unit/{pricing-display,client-ip,plan-form}.test.mjs`, `tests/integration/edge/usage-limits-concurrency-runner.ts`, `docs/plans-and-usage-limits.md`, este relatório.

**Alterados**: `src/lib/billing/queries.ts`, `src/lib/admin/{queries,actions}.ts`, `src/lib/companies/actions.ts`, `src/lib/team/queries.ts`, `src/types/{billing,admin,supabase}.ts`, `src/config/marketing.ts`, `src/middleware.ts`, layouts `(app)` e `admin`, páginas `(public)/page.tsx`, `app/assinatura{,/planos}`, `app/equipe`, `admin/plans`, `admin/settings`, componentes `plan-card`/`pricing-card`, `tests/sql/admin_platform.sql` (2 expectativas: `OK=3` → `OK=7`, pelas 4 chaves novas de configuração), `tsconfig.json`/`eslint.config.mjs` (excluem `tests/integration/edge`).

## 4. Banco (migration única, aditiva)

* **Tabelas novas**: `plan_benefits`, `user_session_slots`, `trial_signup_events` — todas com RLS ligada e `revoke all` para `anon`/`authenticated`; só `service_role` acessa (as RPCs `SECURITY DEFINER` fazem a mediação).
* **Colunas novas** em `plans` (12) + 9 CHECKs (destaque, comprimentos, formato de `contact_url` incl. rejeição de `//host`, faixa do preço anterior, anterior > preço, janela de promoção, promoção exige anterior; `currency='BRL'` e "CUSTOM sem preço" como `NOT VALID`).
* **RPCs novas**: `admin_save_plan` (super_admin, atômica), `list_platform_plan_history`, `plan_discount_percent`, `plan_promo_state`, `plan_kind`, `get_company_seat_usage`, `session_slot_status`, `register_session_slot`/`release_session_slot` (service_role), `authorize_trial_signup` (service_role), `get_my_trial_status`. **Trigger**: `company_members_seat_limit`.
* **Recriadas**: `get_public_plans` (14 → 26 colunas), `list_platform_plans` (22 → 39), `platform_setting_definitions` (3 → 7 chaves), `set_platform_setting` (+2 validações cruzadas), `create_company_with_owner` (exige autorização), `claim_subscription_payment` (recusa trial/preço ≤ 0).
* Política (RLS) de tabelas existentes: **inalterada** (digest de `policy` idêntico antes e depois: 88 itens).
* Registro no TEST: versão `20261014122223` (o MCP atribui o carimbo; o arquivo mantém `20261014000000`).

## 5. Onde cada regra é imposta

| Regra | Impõe | Camada |
|---|---|---|
| Permissão de editar plano | `admin_save_plan` → `is_super_admin()` | Banco (+ Server Action) |
| Desconto | `plan_discount_percent` | Banco (espelho TS só para exibição) |
| Plano inativo/preço inválido não compra | `claim_subscription_payment` | Banco (checkout usa o preço do banco) |
| Vagas | RPCs de membros + trigger `company_members_seat_limit` | Banco |
| Sessões | `register_session_slot` (lista de sessões vem do Clerk no servidor) | Banco + layouts |
| Teste por conexão | `authorize_trial_signup` + `create_company_with_owner` | Banco; IP calculado no servidor |
| Configurações | `set_platform_setting` (super_admin, faixa validada, auditoria) | Banco |

**Onde o cadastro é bloqueado (e onde não)**: o signup no Clerk **não** é bloqueado. O controle fica no onboarding (`createCompanyAction`): acima do limite, a empresa é criada **sem** teste grátis e o aviso exigido aparece em `/app/assinatura`.

## 6. Testes executados (resultados reais, TEST)

| Bateria | Resultado |
|---|---|
| `tests/sql/plans_management.sql` (planos, preços, desconto, promoção, benefícios, permissões, checkout, vitrine) | **141/141** |
| `tests/sql/usage_limits.sql` (vagas, isolamento entre tenants, sessões, antifraude, teste idempotente, configurações) | **101/101** |
| Concorrência real (Edge Function temporária no TEST, `usage-limits-concurrency-runner.ts`) | **18/18**, executada 2×, sem 5xx; resíduos 0 (75 perfis/8 empresas criados e removidos) |
| Regressão SQL: billing 69 · admin 299 (`OK=7`) · licenças 96 · membros 50 · isolamento 39/0 · legal 73 · identidade 21 | todas verdes |
| Prova de rollback + replay (S0/S1/S2) | ver §7 — **VERIFIED** |
| `npm run lint` | 0 erros, 10 avisos (todos em arquivos que esta missão não tocou) |
| `npm run typecheck` | limpo |
| `npm run test:unit` | 137 testes: 136 passam, 0 falham, 1 skipped |
| `npm run build` (env placeholder do CI) | sucesso |

Cenários de concorrência (todos verdes): U1 12 inclusões simultâneas em 2 vagas ⇒ exatamente 2 passam; U2 última vaga disputada ⇒ 1; U3 admin+employee ⇒ 1; U4 5 empresas ⇒ sem vazamento; U5/U5b/U5c/U6 sessões (nunca mais que o limite; reverificação estável; liberar em paralelo ⇒ 1 `true`); U7/U8/U9 antifraude (eventos `allowed` nunca passam do limite; uma auditoria por negativa; mesma decisão para o mesmo usuário; contagem por conexão independente).

Cobertura pedida (A–F): preços/desconto (A), benefícios/permissões (B), vagas + isolamento (C), sessões (D), signup/IP — cabeçalhos forjados, IP compartilhado, replay, concessão duplicada, signup sem teste (E), regressão (F). Testes existentes não foram enfraquecidos; a única edição em teste antigo (`admin_platform.sql`) aumentou as expectativas por causa das 4 chaves novas.

### Não executado / bloqueado
* **BLOCKED** — login real no Clerk e telas autenticadas (`/admin/plans`, `/acesso-sessoes`, `/app/equipe`): a regra do projeto proíbe criar conta/digitar senha, e o Preview é protegido por SSO e não é isolado. Cobertura por RPC/SQL, unit e build; **sem captura de tela**.
* **NOT VERIFIED** — API real de sessões do Clerk (listagem de sessões ativas) e a presença do claim `sid` no JWT do Supabase (**INFERRED**; a RPC de status cai para o `sid` do servidor).
* **NOT VERIFIED** — fluxo de cadastro real ponta a ponta (cabeçalhos reais da Vercel); a extração de IP foi testada por unit com entradas sintéticas.
* **NOT VERIFIED** — cobrança real (EvoPay não tem sandbox; nenhuma cobrança real foi criada). `billing_compat_old_code.sql` não foi reexecutado (não referencia objetos alterados).
* **NOT VERIFIED** — carga/latência do gate de sessões em produção.

## 7. Rollback — prova

Procedimento: `supabase/rollback/20261014000000_plans_management_and_usage_limits.down.sql` (transação única). Prova em TEST, uma transação que termina em erro proposital (nada persiste), com a impressão digital do catálogo `tests/sql/catalog-fingerprint.sql`: **S0** (estado atual) → `down` → **S1** → `up` (arquivo da migration, verificado por MD5 `526fdff3…5918`) → **S2**.

* **S2 == S0** nos 9 tipos (acl 325, column 611, constraint 338, fn_body 143, fn_cfg 143, index 245, policy 88, rel 56, trigger 72) — **VERIFIED**.
* **S1 == referência pré-missão** (digests do TEST antes desta migration, registrados em `tests/sql/build-full-rollback-proof.mjs`): acl 317 `86bdbab0…`, column 577 `a8d8b0e0…`, constraint 317 `b6dd9bbd…`, fn_body 131 `051c9762…`, fn_cfg 131 `b329f0b6…`, index 237 `f6146d2e…`, policy 88 `a646566a…`, rel 53 `a3463f50…`, trigger 70 `8d925b6c…` — **VERIFIED** (todos idênticos).
* O rollback **não** devolve dados (benefícios, campos comerciais, slots, eventos antifraude); preços, assinaturas, pagamentos e entitlements ficam intactos. Detalhes em `docs/plans-and-usage-limits.md` §9.

## 8. Riscos residuais

1. **Ordem de implantação**: migration e código precisam ir juntos (§7 do doc técnico). Fora disso novos cadastros ficam sem teste até alinhar; ninguém é cobrado errado.
2. **Signup não é bloqueado no Clerk**: atacante ainda cria contas; apenas não recebe o teste grátis acima do limite. Bloqueio no provedor exigiria webhook/Clerk allowlist (fora de escopo).
3. **Gate de sessões nos layouts**: Server Actions/APIs chamadas por sessão já bloqueada não são barradas individualmente; fail-open em falha de infraestrutura.
4. **IP atrás de NAT/CGNAT** compartilha o limite (3/24 h): falso positivo possível; mitigado por janela curta, expiração automática e ajuste pelo super_admin.
5. **Segredo do HMAC**: sem `ANTIFRAUD_HASH_SECRET`, deriva-se do segredo do Clerk. Rotacionar um dos dois zera a correlação histórica (aceitável: retenção curta). Recomenda-se definir `ANTIFRAUD_HASH_SECRET` (ação do dono; não feita aqui).
6. **Vitrine**: planos de QA pré-existentes no TEST (`E2E_PLANO`, `E2E_PLANO_QA`) aparecem no catálogo do TEST; irrelevante para Production.
7. **Flags sem funcionalidade** (`tickets`, `groups`, `early`) existem nos planos mas não são anunciados; uma tabela genérica de recursos extensíveis **não** foi criada (reuso do modelo atual, conforme pedido).
8. Escrita administrativa concorrente no mesmo plano usa `SELECT … FOR UPDATE` em `admin_save_plan`; as RPCs reusadas mantêm o comportamento anterior.

## 9. Isolamento do TEST

* Todas as chamadas SQL/Edge desta missão usaram o projeto `zlmxbqlpjstmllrvafmy`. Nenhuma credencial de Production foi usada; nenhuma chave foi impressa.
* Edge Functions temporárias de concorrência substituídas por *stub* `410` (não há como deletar via MCP); fixtures removidas (resíduos `[PMTEST]/[ULTEST]/[UL-CONC]/[CONCTEST]`: **0**); tabela de rascunho `zz_scripts` removida; `user_session_slots`/`trial_signup_events` vazias.
* Planos fora do conjunto de sistema no TEST (`E2E_PLANO`, `E2E_PLANO_QA`, `LIFETIME`, `TEST_R1`) e as 3 configurações em `platform_settings` (08/10) são **anteriores** a esta missão.

## 10. Production

**Inalterada.** Nenhuma migration, SQL de escrita, variável, configuração, deploy ou merge em Production; PR #33 **não** mergeada. Evidência: **VERIFIED por construção** (todas as chamadas apontam para o projeto TEST) — **não** houve leitura direta de Production nesta missão (o classificador nega leituras em Production e isso não foi contornado), portanto "Production intacta" é afirmado a partir do escopo das ações, não de uma consulta. A migration está pronta para revisão, mas **não foi autorizada** para Production.

## 11. Git / CI

Ver o rodapé "Estado Git/CI" atualizado após o commit (hash, PR de rastreio e resultado do workflow *Phase 3 CI*). O workflow só dispara em PR para `main`, push em `main`/`fix/**` ou execução manual (o arquivo ainda não está na `main`, então o disparo manual não está disponível).

## 12. Próximos passos que dependem de autorização

1. Revisão desta migration + PR #33 e decisão de Go-Live (ordem: migrations 08 → esta; código junto).
2. Definir `ANTIFRAUD_HASH_SECRET` (e, se fora da Vercel, `TRUSTED_PROXY_HOPS`) no ambiente-alvo.
3. Validação autenticada manual (telas de admin, `/acesso-sessoes`, cadastro real) por quem possa fazer login.
4. Eventual webhook do Clerk para bloquear signup no provedor (decisão de produto).

**Parada obrigatória**: nada além do escopo foi feito; aguardando autorização explícita para a próxima etapa.
