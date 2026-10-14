# Planos, preços e limites de uso

Referência técnica da gestão de planos (Admin Control Center → **Planos**) e dos limites de uso: vagas de usuário por plano, sessões simultâneas por conta e teste grátis por conexão. Migrations (nesta ordem): `20261014000000` (expansão 1) · `20261014000100` (expansão 2) · `20261014000200` (contração) · `20261014000300` (acesso aos dados, opcional). Rollbacks em `supabase/rollback/` (ordem inversa).

> Estado: aplicado **somente no projeto TEST**. Production não foi tocada. Evidências e riscos: `docs/qa/mission-plans-management-and-usage-limits.md` e `docs/qa/mission-09-closure.md`.

## 1. Modelo (sem tabelas paralelas)

| Conceito | Onde vive | Observação |
|---|---|---|
| Plano comercial | `plans` (+12 colunas: `tagline`, `highlight`, `public_visible`, `cta_label`, `contact_url`, `benefits_title`, `compare_price`, `promo_enabled`, `promo_starts_at`, `promo_ends_at`, `show_compare_price`, `show_discount_percent`) | Os 5 planos do sistema continuam sendo as mesmas linhas. |
| Benefícios **comerciais** | `plan_benefits` (texto, destaque, visível, incluído, ordem, `archived_at`) | Só texto de vitrine; remover = arquivar. **Não concede acesso a nada.** |
| Direitos **reais** | `plans.additional_user_limit`, `plans.support_enabled` (+ flags sem funcionalidade) → `company_entitlements` por assinatura | A vitrine só promete usuários adicionais e suporte. |
| Histórico | `audit_logs` (`platform.plan.details_updated` com `from`/`to`) | `list_platform_plan_history()`. |
| Limites configuráveis | `platform_settings` | super_admin; faixa validada; auditado. |

Chaves em `platform_setting_definitions()`: `max_concurrent_sessions` (3, 1–20), `trial_signup_ip_limit` (3, 1–100), `trial_signup_ip_window_hours` (24, 1–720), `trial_signup_retention_days` (30, 30–365).

## 2. Preços e descontos

* `price` = vigente; `compare_price` = anterior (opcional). O desconto **nunca é digitado**: `plan_discount_percent()` (SQL, `numeric`, metade-para-cima, 1 casa) é a definição única; `src/lib/billing/pricing-display.ts` espelha em centavos inteiros com testes de paridade (89,90 → 65,00 = R$ 24,90 ≈ **27,7%**).
* Promoção: `plan_promo_state()` ⇒ `none | scheduled | active | expired`; **expirada só esconde o preço anterior na vitrine; nunca reverte o preço cobrado.**
* Vitrine pública: `get_public_plans()` (anon): `active`, não vitalício, `public_visible`; desconto/economia calculados; nenhum campo administrativo.
* Checkout: `claim_subscription_payment()` lê o preço **do banco**; recusa plano inativo, de teste, sem duração ou preço ≤ 0. Mudar o preço não altera cobranças já criadas (`subscription_payments.amount`) nem assinaturas.
* **Oculto** (`public_visible = false`): fora do catálogo, mas quem já está no plano renova. **Inativo**: não compra nem por chamada direta. Os 5 planos do sistema não se desativam; planos não se apagam.

## 3. Quem pode o quê

Criar/editar/ativar/desativar plano: **somente super_admin** (`admin_save_plan` confere no banco; Server Action revalida). Admin comum lê. `anon`/`authenticated` não escrevem em `plans`/`plan_benefits` (RLS + `revoke`).

## 4. Vagas de usuário por plano

Conta: proprietário (isento) + adicionais. Limite = `company_entitlements.max_additional_users` (snapshot por assinatura; editar o plano **não propaga** sem `apply_limits_to_existing = true`). Imposto nas RPCs e no trigger `company_members_seat_limit` (`SECURITY INVOKER`, trava a linha do entitlement; mensagem uniforme para INSERT em empresa alheia). Reduzir abaixo do uso não remove ninguém: bloqueia novas inclusões e a UI mostra o excesso.

## 5. Sessões simultâneas (`session-gate-core.ts`, `session-gate.ts`, `middleware.ts`)

**Fontes de verdade (nenhuma vem do navegador):** o `sid` do JWT identifica QUAL sessão é (claim padrão do Clerk, assinado) — **nunca quantas existem**; as sessões ativas vêm da **API do Clerk no servidor** (`sessions.getSessionList({ status: "active" })`); a decisão é do **banco**, atômica por usuário (`register_session_slot`, `service_role`, advisory lock).

**Onde é imposto:**
1. **Middleware** (páginas, Server Actions e APIs sob `/app`, `/admin`, `/onboarding`, `/api/billing`): lê `session_slot_status` (barato, com o token do usuário). `allowed` ⇒ segue · `blocked` recente ⇒ páginas vão a `/acesso-sessoes`, Actions/APIs recebem **403 `SESSION_LIMIT_REACHED`** · `unknown` (nunca validada) ⇒ páginas seguem para a verificação, Actions/APIs recebem **403 `SESSION_UNVERIFIED`**. `/api/presence` (heartbeat a cada 60 s) fica de fora de propósito.
2. **Layouts** `(app)` e `admin` e a página `/onboarding`: verificação completa (`evaluateSessionGate`): Clerk → registro no banco.

**Comportamento diante de falhas (explícito e limitado):**
| Situação | Resultado |
|---|---|
| Sessão **já validada** (vaga `allowed`) e Clerk/serviço fora do ar | segue acessando (ninguém é derrubado por falha nossa) |
| Sessão **nunca validada** + Clerk falha/expira (4 s, 1 repetição) ou registro falha | `unverified`: negada **só a essa sessão**, temporariamente, com a mensagem "não foi possível verificar" e botão de nova tentativa; nenhuma vaga é consumida |
| Clerk não lista a sessão (revogada/propagando) | `unverified` (não ocupa vaga, não é "bloqueio por limite") |
| Função do gate ausente no banco (migration ainda não aplicada) | `allowed` com log (fase de expansão do deploy) |
| `SUPABASE_SERVICE_ROLE_KEY` ausente no ambiente | `unverified` + erro de configuração no log (nunca libera em silêncio) |

**Corrida:** a lista do Clerk é lida antes do registro; por isso uma vaga aceita há < 60 s **não é podada** por listas "velhas" e listas incompletas (> 100 sessões) nunca podam (`p_list_complete`). Sessões que o Clerk já não lista liberam a vaga no próximo registro.

**Limitações:** o token Clerk de uma sessão revogada vale até ~60 s (vida do token); a recusa vale para a **aplicação** — quem chama o PostgREST direto com o próprio JWT continua limitado só pela RLS (por isso a M4 fecha a escrita sem acesso ativo); presença do `sid` no JWT do Supabase é **inferida** (o app sempre passa o `sid` do servidor como parâmetro).

## 6. Teste grátis por conexão

**Onde cada coisa é (ou não) bloqueada:**
| Nível | Bloqueado? |
|---|---|
| 1. Criação da conta no Clerk | **Não** pelo app. Controles nativos do Clerk (Dashboard, do dono): *Challenge suspicious sign-ups*, bloquear e-mails descartáveis, blocklist/allowlist, modo de acesso restrito |
| 2. Criação da empresa | **Não**: quem é negado cria a empresa **sem** teste |
| 3. Concessão do teste | **Sim**: só com autorização do servidor (`authorize_trial_signup`) válida (1 h), não consumida, e uma única vez por usuário (`subscriptions_one_trial_per_user_idx` + locks) |
| 4. Acesso aos recursos | **Sim**: sem acesso ativo o middleware leva a `/app/assinatura` **e** (M4) o banco recusa INSERT/UPDATE/DELETE nas tabelas de negócio (`company_has_active_access`) |

* Controle de IP: `x-vercel-forwarded-for`/`x-forwarded-for`/`x-real-ip` só com `VERCEL=1`; ou `TRUSTED_PROXY_HOPS` (conta do fim do XFF); senão `null`. IPv6 /64. HMAC-SHA256 com versão `v1`. IP desconhecido ⇒ registrado, **com teto próprio** (10× o limite) — não é "livre". Janela/limite configuráveis; negação expira com a janela; auditoria só com prefixo de 8 caracteres.
* **Pedido posterior** (`requestFreeTrialAction` → `authorize` + `claim_free_trial`): quem foi negado (ou ficou sem autorização) pode pedir o teste depois, sem recriar empresa, com a mesma regra; idempotente e serializado.
* **Webhooks do Clerk**: não implementados. Eventos (`user.created`, `session.*`) são assíncronos (pós-fato), verificados com `verifyWebhook` e `CLERK_WEBHOOK_SIGNING_SECRET`; não bloqueiam o cadastro e (inferido) não trazem o IP. O ponto de controle server-side do onboarding já é idempotente. Fica como endurecimento opcional.

## 7. Segredo antifraude (`ANTIFRAUD_HASH_SECRET`)

Validado no servidor (`resolveAntifraudSecret`): ≥ 32 caracteres variados. **Production não tem fallback**: ausente/fraco ⇒ teste grátis **suspenso** (conta, empresa e compra de planos seguem). Fora de Production, ausente ⇒ deriva do `CLERK_SECRET_KEY` do próprio ambiente (chaves diferentes por ambiente ⇒ identificadores nunca coincidem). Fraco/curto é erro de configuração em qualquer ambiente (não é "consertado" com outro). O valor nunca é logado nem exibido; `/admin/settings` mostra só o **estado**. Rotação: os identificadores antigos deixam de coincidir ⇒ os contadores por conexão recomeçam (retenção 30 dias); nada é corrompido. Configurar pelo painel da Vercel, escopo do ambiente; **nunca pelo chat**.

## 8. Implantação segura (expansão → código → contração)

O deploy **não é atômico** (banco e Vercel são processos separados). A ordem abaixo garante que em nenhum passo o teste é negado a quem deveria ter nem concedido sem regra por erro de versão:

0. Pré-requisitos: as 5 migrations da Missão 08 (PR #33) já aplicadas; `ANTIFRAUD_HASH_SECRET` definido em Production (valor próprio); backup/fingerprint do catálogo.
1. **Expansão** — aplicar `…000000` e `…000100`. Compatíveis com o código **antigo** (provado em TEST): cadastros seguem recebendo o teste; a vitrine nova é superconjunto da antiga.
2. **Deploy do código novo.** Funciona com a expansão (e degrada com segurança em banco antigo: gate "não instalado" ⇒ libera com log; normalizador da vitrine tolera o formato antigo).
3. **Contração** — aplicar `…000200`: o teste passa a exigir a autorização do servidor. Verificar: cadastro novo recebe o teste; chamada direta a `create_company_with_owner` não.
4. **Opcional/decisão de produto** — `…000300` (RLS de acesso aos dados). Pode ficar para depois.
5. Pós-checagens: `/admin/settings` (antifraude OK), home com planos, logs sem `gate_not_provisioned`/`SUPABASE_SERVICE_ROLE_KEY ausente`.

Reversão: `down` na ordem inversa (000300 → 000200 → 000100 → 000000); **reverter só a contração** devolve o comportamento anterior sem mexer no resto.

## 9. Rollback

`down` de cada migration (provas S0/S1/S2 em `docs/qa/mission-09-closure.md`). Não restauram **dados** (benefícios, campos comerciais, slots de sessão, eventos antifraude); preços, assinaturas, pagamentos e entitlements nunca são tocados.
