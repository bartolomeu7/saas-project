# Missão 07 — Financial hardening, segurança, CI/CD, auth e prontidão legal

Data: 2026-10-09 · Branch: `fix/mission-07-hardening` (base `4a946fa`) · Ambiente de correção e teste: **TEST** (`zlmxbqlpjstmllrvafmy`). Production (`fpbcruinppjbwtinzrdg`) só inspecionada, sem escrita.

> **Atualização (Missão 07.1):** compatibilidade, rollback, contrato EvoPay e Preview foram tratados em `docs/qa/mission-07-1-release-readiness.md`. As linhas R13, R15 e R16 abaixo foram reavaliadas lá (R15: build do Preview PASS, runtime NOT VERIFIED; R13 e R17 seguem BLOCKED).

## Veredito

**CORREÇÕES VALIDADAS COM RESSALVAS**

As correções de billing, privilégios e consentimento estão validadas em TEST (banco e código) e sem regressão. Ficam como **NOT VERIFIED / BLOCKED**: concorrência real, EvoPay real, deployment de Preview, CI em Node 22, login/Admin/T10 em navegador com sessão real, e todos os dados jurídicos. Nada foi promovido a Production.

## A. Resumo executivo

| Área | Resultado |
|---|---|
| Cobrança duplicada | Corrigida (claim idempotente + índice único parcial). Provado em SQL. |
| Valor divergente liberava acesso | Corrigido (fail closed por centavo). Provado em SQL e unit. |
| Estorno | Detectado (`recheckPaid`), `refunded` terminal; não revoga acesso sozinho. |
| Privilégios | `anon` sem privilégio de tabela; `authenticated` sem TRUNCATE/TRIGGER/REFERENCES/MAINTAIN; funções de trigger não executáveis. |
| Consentimento | Barreira central no middleware (páginas, Server Actions, APIs). |
| CI | Node 22 + lint + typecheck + unit + build. |
| Preview | Causa raiz achada e corrigida no código; env da Vercel documentado, **não** alterado. |
| Auth real | BLOCKED (sem sessão no navegador); identidade validada em SQL (22/22). |
| Legal | BLOCKED (dados da empresa e revisão jurídica). rc.2 mantida. |

## B. Fase 0 — Preflight

Branch criada a partir de `4a946fa`. `b.txt` preservado (não rastreado). Production: 71 migrations, 2 profiles, 1 company, 6 plans, 0 payments/events/consents, 1 super_admin ativo. TEST sem resíduo de QA.

## C. Fase 1 e 2 — Billing e privilégios

Detalhes e rollback em `docs/billing-hardening.md`. Antes/depois dos privilégios (para rollback da migration `20261011000100_privilege_minimization.sql`):

| Classe de tabela (public) | Antes | Depois |
|---|---|---|
| 42 tabelas legadas | `anon` e `authenticated` com todos os privilégios | `anon`: nenhum; `authenticated`: SELECT/INSERT/UPDATE/DELETE |
| `products` | `authenticated` sem UPDATE | inalterado (sem TRUNCATE etc.) |
| `sales` | `authenticated` sem INSERT/UPDATE | inalterado |
| `audit_logs` | `anon`/`authenticated` só REFERENCES, SELECT, TRIGGER, TRUNCATE | `anon`: nenhum; `authenticated`: SELECT |
| 7 tabelas internas (platform_settings, user_presence, webhook_deliveries etc.) | sem grants | inalterado |
| Funções de trigger | EXECUTE para public/anon/authenticated | sem EXECUTE |
| Default privileges (role postgres) | anon com tudo em tabelas; EXECUTE em funções para public/anon | revogados |

Verificado depois: REST anônimo em tabelas → 401/42501; RPCs públicas (`get_public_plans`, `get_current_legal_documents`) → 200; fluxos autenticados legítimos e triggers continuam funcionando.

## D. Fase 3 — CI e Preview

Ver `docs/ci-and-environments.md`. Causa raiz: layout `(app)` pré-renderizado sem credenciais no Preview; correção `force-dynamic`. Build reproduzido com anon/Clerk/service role vazios: **falhava antes, passa agora**. `NEXT_PUBLIC_SUPABASE_URL` com alvo preview+production aponta o Preview para Production — correção só documentada.

## E. Fase 4 — Auth real

Sem sessão autenticada no navegador embutido (tela de login). Não foram digitadas credenciais nem criadas contas. **Login, logout, renovação de sessão, Admin e T10 em navegador: NOT VERIFIED.** Semântica de identidade validada em TEST: `tests/sql/auth_identity.sql` 22/22 (perfil novo não duplica, suspenso/inativo nunca recriado nem reativado, JWT sem `sub`, papel anon).

## F. Fase 5 — Legal

`docs/legal/final-publication-checklist.md`: 10 campos empresariais faltando, 16 perguntas jurídicas, mudanças técnicas e procedimento de publicação. Único dado candidato no código (`suporte@primeges.com.br`) **não confirmado**, não usado. `1.0.0-rc.2` mantida (hashes inalterados).

## G. Fase 6 — Matriz de testes (estado final do TEST)

| ID | Ambiente | Cenário | Esperado | Observado | Status |
|---|---|---|---|---|---|
| R1 | TEST | Billing SQL (`billing_confirm.sql`) | 69 checks | 69/69 | PASS |
| R2 | TEST | Admin/RBAC (`admin_platform.sql`) | 299 checks, diagnostics = 13 | 299/299 | PASS |
| R3 | TEST | Consentimento (`legal_consent.sql`) | 73 checks | 73/73 | PASS |
| R4 | TEST | Isolamento (`tenant_isolation.sql`) | 0 vazamentos | 0 em 39 tabelas; claim e TRUNCATE negados | PASS |
| R5 | TEST | Identidade (`auth_identity.sql`) | 22 checks | 22/22 | PASS |
| R6 | local | `npm run lint` | 0 erros | 0 erros, 11 warnings herdados | PASS |
| R7 | local | `npm run typecheck` | 0 erros | 0 erros | PASS |
| R8 | local | `npm run test:unit` | sem falhas | 64 testes, 63 pass, 0 fail, 1 skip | PASS |
| R9 | local | `npm run build` com credenciais | sucesso | sucesso | PASS |
| R10 | local | build simulando Preview (sem anon/Clerk/service) | sucesso | sucesso (falhava antes) | PASS |
| R11 | Production | Smoke somente leitura | públicas 200, protegidas 307 | `/` `/login` `/termos-de-uso` `/politica-de-privacidade` `/robots.txt` 200; `/app` `/admin` `/app/vendas` 307 para login; `POST /api/billing/create-payment` sem sessão 401 | PASS |
| R12 | Production | Dados inalterados | 71 migrations, sem claim RPC | 71 migrations (última `20261008202401`), `has_claim_rpc=false`, 2 profiles, 1 company, 0 payments/events/consents, 1 super_admin ativo | PASS |
| R13 | TEST | Concorrência real (20 requisições simultâneas) | uma cobrança | não executável (service-role key de TEST ausente; MCP serializa) | BLOCKED |
| R14 | — | EvoPay real (valor retornado, webhook, estorno) | — | sem sandbox; sem payload real | NOT VERIFIED |
| R15 | Vercel | Deployment de Preview | — | sem env de Preview; nenhum deploy feito | NOT VERIFIED |
| R16 | GitHub | CI em Node 22 | — | não disparado (sem push/PR) | NOT VERIFIED |
| R17 | Production | Login/Admin/T10 com sessão real | — | sem sessão | NOT VERIFIED |

Resíduos: TEST sem dados de QA (todas as baterias terminam em `RAISE EXCEPTION` com rollback).

## H. Commits na branch

`68697fb` billing · `9d55b26` privilégios · `767ee06` consentimento · `750e681` CI + layout dinâmico · `b60a908` teste SQL de identidade · `1d7e9a3` documentação. Missão 07.1: ver o relatório complementar.

## I. Riscos residuais

1. Valor devolvido pela EvoPay: semântica desconhecida; falha fechada pode rejeitar a primeira cobrança real.
2. Concorrência garantida por lock + índice, mas não exercitada em paralelo real.
3. Chamada direta ao PostgREST com JWT próprio ignora a barreira de consentimento (RLS e isolamento continuam).
4. Preview apontaria para o banco de Production se a variável de URL não for separada.
5. Payload financeiro (dados do pagador) sem expurgo; depende de decisão jurídica.

## J. Para ir a Production (cada passo exige autorização própria)

1. Revisão desta branch/PR; merge só com autorização.
2. Aplicar em Production, nesta ordem, as migrations `20261011000000_billing_hardening.sql` e `20261011000100_privilege_minimization.sql` (a primeira remove a assinatura antiga de `confirm_subscription_payment`).
3. Só depois, deploy do código.
4. Smoke, teste manual T10 e uma cobrança real de valor mínimo para validar o campo de valor da EvoPay.
5. Separar `NEXT_PUBLIC_SUPABASE_URL` por escopo e criar o env de Preview com credenciais de TEST.
6. Conseguir dados da empresa e revisão jurídica antes de publicar versão final dos documentos.

## K. Não validado / bloqueado

R13–R17 acima; Clerk dashboard (conector sem autenticação); logs de runtime da Vercel e tabelas de log do Supabase; dados jurídicos (`BLOCKED — informação empresarial ou jurídica necessária`).
