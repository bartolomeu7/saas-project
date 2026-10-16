# Go Live final — Prime Ges (2026-10-14)

> **Declaração: `GO LIVE BLOQUEADO — PRODUÇÃO NÃO PUBLICADA`.**
> Nada foi alterado em Production (banco, Vercel ou domínio). O bloqueio é um **passo de migration em Production** que o
> classificador de permissões do Claude Code negou (`apply_migration` no projeto `fpbcruinppjbwtinzrdg`, motivo
> "Protected-Scope IaC Apply"). Não foi contornado. Detalhes e a ação necessária na seção E.

Classificação das evidências: **VERIFIED** (observado nesta execução) · **NOT VERIFIED** · **BLOCKED** · **INFERRED**.

## A. GitHub

| Item | Estado |
|---|---|
| Repositório | `bartolomeu7/saas-project` (público) · `origin/main` = merge do PR #32 (`3931854`) — VERIFIED |
| Cadeia de PRs | `main` ← PR #33 `feat/mission-08-admin-control-center` (274c7bc, +23 commits) ← PR #34 `feat/plans-management-usage-limits` (f7fa8c5 antes deste documento, +26). #33 é ancestral de #34 — VERIFIED (`merge-base --is-ancestor`) |
| Estado dos PRs | #33 aberto, não-draft, MERGEABLE; #34 aberto, **draft**, MERGEABLE — VERIFIED |
| Checks | `Phase 3 CI / verify` verde em `274c7bc` (run 38558874762) e em `f7fa8c5` (run 38601444418); `Vercel` (Preview) verde nos dois — VERIFIED |
| Proteção da `main` | **sem proteção de branch** (API 404) — não há check obrigatório imposto pelo GitHub; o gate é por disciplina — VERIFIED |
| Commits locais não enviados | nenhum na branch candidata (0/0 contra `origin`); `feat/ui-revamp-shadcn` tem 1 commit local antigo, fora do escopo — VERIFIED |
| Não versionado de propósito | `b.txt` (arquivo local pré-existente), `.env.local`, `.env.prod-backup.local` — NÃO commitar |
| **Commit candidato** | cabeça do PR #34 (inclui #33). Hash exato = o commit que contém este documento (ver "Estado Git" no relatório final); o código é idêntico ao de `6e9ef7f`/`f7fa8c5` (só documentação mudou) |
| Merge | **NÃO feito** (intencional: ver seção E, passo 1). Mesclar antes das migrations quebraria cobrança em Production (cabeçalho de `20261011000000_billing_hardening.sql`) |

Deploys de Preview do GitHub/Vercel existem para #33 e #34, mas **não são isolados** (ver B).

## B. Vercel

| Item | Estado |
|---|---|
| Projeto | `prj_5WpaIqlbBk5dohpT2DW1J1ufaZ1O` · domínios: `primeges.com.br` e `saas-project-eta-eight.vercel.app` (verificados) — VERIFIED |
| Variáveis (só nomes/ambientes) | Production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (pk_live), `CLERK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `EVOPAY_API_KEY`, `EVOPAY_API_BASE_URL` (+ integração Supabase) — VERIFIED |
| **`ANTIFRAUD_HASH_SECRET`** | **AUSENTE em todos os ambientes** — VERIFIED. Efeito em Production: teste grátis **suspenso** (sem fallback) depois da contração `…000200`; conta, empresa e compra de planos seguem |
| Preview da branch do PR #34 | **não isolado / não funcional**: só existem sobrescritas de Preview (URL/anon TEST, pk_test) para as branches `feat/mission-08-admin-control-center`, `feat/clerk-auth-prep` e `feat/ui-revamp-shadcn`; `NEXT_PUBLIC_SUPABASE_URL` genérica vale para `preview` **e** `production`; não há `CLERK_SECRET_KEY`/service role de TEST para Preview — VERIFIED (nomes) |
| Preview autenticado (login, onboarding, trial, limites, admin, tenant) | **BLOCKED**: Preview com SSO da Vercel + sem ambiente isolado + sem conta de teste do Clerk Development. Escrever em banco a partir de um Preview não isolado seria arriscar Production |
| Deploy de Production | **NÃO realizado** |
| Domínio | `primeges.com.br` não foi alterado; a versão em Production continua a do merge do PR #32 — INFERRED (nenhuma ação de deploy foi feita) |

## C. Banco de dados

**Production (`fpbcruinppjbwtinzrdg`, Postgres 17.6, ACTIVE_HEALTHY) — leitura somente (VERIFIED):**

* `schema_migrations`: **71** migrations, a última é `legal_rc2` (`20261008202401`). **Nenhuma** das 9 migrations pendentes foi aplicada.
* Ausentes (confirmado também por catálogo: coluna `subscriptions.lifetime` e as funções `admin_save_plan`, `register_session_slot`, `authorize_trial_signup`, `company_has_active_access` não existem): as 5 da Missão 08 (`20261011000000` billing_hardening, `20261011000100` privilege_minimization, `20261012000000` lifetime_access_and_license_ops, `20261012000100` plans_lifetime_awareness, `20261012000200` admin_company_members_and_reconciliation) e as 4 da Missão 09 (`20261014000000`, `…000100`, `…000200`, `…000300`).
* Nomes e ordem batem com o repositório (o histórico live usa `version` por timestamp de aplicação e `name` lógico — ver `supabase/migrations/README.md` §1; **não** usar `db push` nem `migration repair`).
* Dados de Production: 1 empresa, 1 assinatura (`FREE_TRIAL`, `trialing`, vence **2026-10-17**), 2 perfis, 6 planos (inclui `TEST_R1`, inativo, resto do passado). Impacto de dados das migrations é mínimo; as constraints novas de `plans` são compatíveis com essas linhas (as dependentes de dados existentes são `NOT VALID`).
* Impressão digital do catálogo de Production (baseline antes de qualquer migration, `tests/sql/catalog-fingerprint.sql`): acl 877 `c2c9718c…` · column 568 `3aa8b7a1…` · constraint 312 `e731c1bb…` · fn_body 120 `c05339e5…` · fn_cfg 120 `7ac20789…` · index 234 `e35319de…` · policy 88 `a646566a…` · rel 52 `d4b3eb6b…` · trigger 70 `8d925b6c…`. `policy` e `trigger` coincidem com o estado pré-Missão 09 do TEST (esperado: a Missão 08 não toca políticas/triggers).
* **Backup / recuperação:** plano de backup do projeto **NOT VERIFIED** (não consultável pela ferramenta). O que existe e foi provado em TEST: `down` de todas as 9 migrations em `supabase/rollback/` (S1 e S2 reproduzem as impressões digitais do catálogo). Os `down` **não restauram dados** (listados em `docs/plans-and-usage-limits.md` §9). Recomendado antes de aplicar: confirmar no painel do Supabase o backup/PITR mais recente.

**TEST (`zlmxbqlpjstmllrvafmy`):** as 13 migrations (M08 + M09) aplicadas; catálogo final = prova S2 (`docs/qa/mission-09-closure.md`).

**`20261014000300_data_layer_access_gate` (RLS restritiva de escrita):** **NÃO deve ser aplicada em Production sem decisão do dono.** Efeito: empresas **sem acesso ativo** (teste negado/vencido) deixam de poder gravar nas 18 tabelas de negócio mesmo chamando a API do Supabase direto; leitura não muda; `service_role` e funções `SECURITY DEFINER` não mudam. Achado que a motiva (VERIFIED em TEST na Missão 09): sem ela, dono de empresa sem assinatura grava clientes/produtos/vendas via REST. Impacto em Production hoje: 1 empresa, com acesso ativo até 17/10 — **a partir de 17/10 ela perderia a escrita direta** (o app já a redireciona a `/app/assinatura`). É decisão de produto: aplicar agora, depois ou nunca.
Reprodução do "antes/depois" desta execução: **não repetida** (a ferramenta de SQL foi negada pelo classificador depois da negativa do passo de Production); vale a evidência da Missão 09 (migration e `down` com o mesmo conteúdo — md5 `20c7ec51…` / `dafdc434…`).

## D. Testes (execução de hoje)

| Verificação | Resultado |
|---|---|
| `tests/sql/plans_management.sql` **completo e atualizado**, TEST | **141/141** (fail 0), incluindo "nenhum plano é excluível" — VERIFIED (item 5.1 fechado) |
| `npm run lint` | 0 erros, 10 avisos pré-existentes — VERIFIED |
| `npm run typecheck` | limpo — VERIFIED |
| `npm run test:unit` | 165 passam, 0 falham, 1 skipped (166) — VERIFIED |
| `Phase 3 CI / verify` (lint, typecheck, unit, build) | verde em #33 e #34 — VERIFIED |
| Baterias de sessões/limites/teste grátis/concorrência (`mission09.sql` 63, `usage_limits.sql` 101, runners de Edge Function) | **não repetidas hoje**: o código não mudou desde `6e9ef7f` e o TEST continua no estado S2 → a evidência da Missão 09 segue válida (REUSED, INFERRED-válida). Repetir em qualquer mudança de código |
| Clerk real: lista de sessões ativas / `sid`, cadastro real, conta de teste | **NOT VERIFIED / BLOCKED** (sem conta de teste; Preview não isolado) |
| EvoPay (Pix real) | **NOT VERIFIED** (sem sandbox; nenhuma cobrança real foi feita) |
| Smoke em Production autenticado | **não executado** (não houve deploy) |

## E. Pendências

| # | Pendência | Estado | Impacto | Ação concreta |
|---|---|---|---|---|
| 1 | **Aplicar as migrations em Production** (M08 ×5 e M09 expansão `…000000`, `…000100`) | **BLOCKED** — `apply_migration` negado pelo classificador (Protected-Scope IaC Apply). Inclusive consultas posteriores pela mesma ferramenta passaram a ser negadas | Sem isso o código novo **não pode** ser publicado (quebraria a cobrança) | Dono: (a) adicionar a regra de permissão `mcp__61d5eece-4b2b-457a-b8b7-5a6d62fe282a__apply_migration` (e `execute_sql` para as verificações) nas configurações do Claude Code e mandar continuar; **ou** (b) aplicar você mesmo, **na ordem**, os 7 arquivos: `20261011000000`, `…11000100`, `20261012000000`, `…12000100`, `…12000200`, `20261014000000`, `20261014000100` (arquivos em `supabase/migrations/`, via painel/SQL editor, depois conferir `list_migrations`) |
| 2 | Contração `…000200` (teste grátis exige autorização do servidor) | Pendente, **depende de #3** | Aplicada sem o segredo, o teste grátis **para** em Production | Aplicar só depois do passo 3 e do deploy do código |
| 3 | `ANTIFRAUD_HASH_SECRET` em **Production** | Ausente — owner-only | Teste grátis suspenso em Production após a contração | No painel da Vercel (Production, tipo Sensitive): valor aleatório ≥ 32 caracteres, **único** de Production; **não** enviar pelo chat. Depois peço a verificação de presença (só o nome) |
| 4 | `…000300` | Decisão de produto | ver seção C | Responder: aplicar / adiar / não aplicar |
| 5 | Preview isolado + conta de teste | BLOCKED (owner) | Sem validação autenticada de sessões/limites/trial em ambiente real | Em Preview da branch do PR #34: URL/anon do TEST, pk_test/sk_test (Clerk Development), service role do TEST, `ANTIFRAUD_HASH_SECRET` próprio; remover `preview` das variáveis genéricas; liberar o acesso SSO; criar uma conta de teste no Clerk Development |
| 6 | Proteções nativas de cadastro do Clerk (bot, e-mails descartáveis, blocklist) | Owner (Dashboard do Clerk) | Nível 1 do antifraude (conta) | Ligar no Dashboard |
| 7 | Plano de backup do Supabase de Production | NOT VERIFIED | Recuperação de **dados** | Conferir no painel do Supabase antes do passo 1 |

### Ordem de execução quando as pendências 1 e 3 estiverem resolvidas

1. Backup conferido (E7) → aplicar as 7 migrations de expansão (E1) e validar: `list_migrations` (78 no total), impressão digital do catálogo, `select` nas funções novas.
2. Mesclar #33+#34 em `main` pelo fluxo normal (PR #34 → pronto para revisão → merge); a Vercel publica Production a partir da `main`. Confirmar deployment `Ready` e que `primeges.com.br` serve o commit.
3. Smoke em Production: páginas públicas (home com planos), `/entrar`, rotas protegidas redirecionando, `/api/billing/*` sem sessão = 401/403; com a conta do dono (acesso manual): `/app`, `/admin`, logs sem `gate_not_provisioned` nem "SUPABASE_SERVICE_ROLE_KEY ausente".
4. Com `ANTIFRAUD_HASH_SECRET` presente (E3): aplicar a contração `…000200` e testar um cadastro novo.
5. Decisão sobre `…000300` (E4).

**Reversão:** código → "promover" o deployment anterior na Vercel (a expansão é compatível com o código antigo — provado em TEST); banco → `down` na ordem inversa (`supabase/rollback/`).

## F. Declaração final

**`GO LIVE BLOQUEADO — PRODUÇÃO NÃO PUBLICADA`**

Production (banco, Vercel, domínio) não foi alterada. Tudo o que depende apenas do repositório e do TEST está pronto e verificado (CI verde, 141/141 em `plans_management.sql`, lint/typecheck/unit limpos); o que falta depende de uma permissão para migrations em Production e de configuração/decisão do dono.
