# Missão 08 — Admin Control Center completo + Release Go Live

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
