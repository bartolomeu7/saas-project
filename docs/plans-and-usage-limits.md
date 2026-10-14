# Planos, preços e limites de uso

Referência técnica da gestão de planos (Admin Control Center → **Planos**) e dos três limites de uso: vagas de usuário por plano, sessões simultâneas por conta e teste grátis por conexão. Migration: `supabase/migrations/20261014000000_plans_management_and_usage_limits.sql` · rollback: `supabase/rollback/20261014000000_plans_management_and_usage_limits.down.sql`.

> Estado: aplicado **somente no projeto TEST**. Production não foi tocada. Ver o relatório `docs/qa/mission-plans-management-and-usage-limits.md` para evidências e riscos.

## 1. Modelo (sem tabelas paralelas)

| Conceito | Onde vive | Observação |
|---|---|---|
| Plano comercial | `plans` (+12 colunas: `tagline`, `highlight`, `public_visible`, `cta_label`, `contact_url`, `benefits_title`, `compare_price`, `promo_enabled`, `promo_starts_at`, `promo_ends_at`, `show_compare_price`, `show_discount_percent`) | Os 5 planos do sistema (Teste 1 dia, Mensal 31, Trimestral 93, Anual 365, Personalizado) continuam sendo as mesmas linhas. |
| Benefícios **comerciais** | `plan_benefits` (texto, destaque, visível, incluído, ordem, `archived_at`) | Só texto de vitrine. Remover = arquivar (`archived_at`), nada é apagado. **Não concede acesso a nada.** |
| Direitos **reais** | `plans.additional_user_limit`, `plans.support_enabled` (+ flags `tickets/groups/early`, existentes e ainda sem funcionalidade) → copiados para `company_entitlements` por assinatura | A vitrine só promete usuários adicionais e suporte; os demais flags não aparecem como benefício. |
| Histórico de alterações | `audit_logs` (`platform.plan.details_updated` com `from`/`to`, ator e data) + ações já existentes de preço/estado | Lido por `list_platform_plan_history()` (e-mail do ator só para super_admin). |
| Limites configuráveis | `platform_settings` (chaves novas abaixo) | Editáveis só por super_admin, com faixa validada e auditoria. |

Chaves novas em `platform_setting_definitions()`:

| Chave | Padrão | Faixa | Efeito |
|---|---|---|---|
| `max_concurrent_sessions` | 3 | 1–20 | Sessões ativas por conta. |
| `trial_signup_ip_limit` | 3 | 1–100 | Cadastros com teste grátis por conexão na janela. |
| `trial_signup_ip_window_hours` | 24 | 1–720 | Janela de contagem (precisa caber na retenção). |
| `trial_signup_retention_days` | 30 | 30–365 | Retenção dos registros antifraude. |

## 2. Preços e descontos

* `plans.price` é o preço **vigente**; `compare_price` é o preço anterior/de referência (opcional). Moeda: BRL (CHECK `NOT VALID`: vale para escritas novas, linhas antigas não são reprovadas).
* O desconto **nunca é digitado**: `plan_discount_percent(price, compare)` (SQL, `numeric`, arredondamento metade-para-cima, 1 casa) é a única definição; `src/lib/billing/pricing-display.ts` espelha em centavos inteiros e há testes de paridade (89,90 → 65,00 = R$ 24,90 ≈ **27,7%**). Sem anterior, anterior ≤ preço, zero ou inválido ⇒ sem desconto.
* Promoção: `plan_promo_state()` ⇒ `none | scheduled | active | expired`. **Promoção expirada só esconde o preço anterior/desconto na vitrine; nunca reverte o preço cobrado.**
* Vitrine pública (`get_public_plans()`, lida por anon): só planos `status = 'active'`, não vitalícios e `public_visible`; entrega desconto/economia já calculados e **nenhum** campo administrativo.
* Cobrança: `claim_subscription_payment()` lê o preço **do banco**; recusa plano inativo, de teste, sem duração, ou com preço nulo/≤ 0 (nunca cobra R$ 0). Alterar o preço do plano **não** altera cobranças já criadas nem assinaturas existentes (o valor fica em `subscription_payments.amount`).
* Mínimo de plano pago: R$ 1,00 (limite do provedor de pagamento). Plano `CUSTOM`: sem preço ("Sob consulta"), botão "Entre em contato" com destino configurável (`contact_url`: `https://…`, `mailto:` ou caminho interno `/…`; `//host` é rejeitado) e nunca cobra.

### Oculto × inativo
* **Oculto** (`public_visible = false`): some do catálogo; quem já está nesse plano continua podendo renová-lo em `/app/assinatura/planos`.
* **Inativo** (`status = 'inactive'`): não pode ser comprado nem por chamada direta ao checkout (recusado em `claim_subscription_payment`). Os 5 planos do sistema não podem ser desativados. Planos não são apagados.

## 3. Quem pode o quê

* `/admin/plans` (lista, detalhe, histórico, prévia): qualquer admin da plataforma lê. **Criar/editar/ativar/desativar: somente super_admin** (`admin_save_plan` e as RPCs reusadas conferem `is_super_admin()` no banco; a Server Action revalida).
* Escrita direta em `plans`/`plan_benefits` por `anon`/`authenticated` continua barrada (RLS + `revoke`). Nenhuma `service_role` no navegador.

## 4. Vagas de usuário por plano

* **O que conta**: proprietário (`owner`, sempre 1, isento) + membros adicionais (`role <> 'owner'`). O limite vem de `company_entitlements.max_additional_users`, um **snapshot por assinatura**.
* **Onde é imposto**: (1) RPCs `add_existing_company_member` e `admin_add_company_member` (mensagens claras) e (2) trigger `BEFORE INSERT` em `company_members` (`enforce_company_seat_limit`, `SECURITY INVOKER`, trava a linha de entitlement com `FOR UPDATE`) — a defesa vale para qualquer caminho, inclusive INSERT direto. Última vaga disputada ⇒ exatamente uma passa. Sem entitlement ⇒ limite 0.
* **INVOKER de propósito**: um INSERT direto de `authenticated` em empresa alheia recebe mensagem uniforme (não vaza o limite nem a existência do entitlement de outro tenant).
* **Editar o plano não propaga** para quem já assinou. Só com `apply_limits_to_existing = true` (ação explícita, auditada) os entitlements `trialing/active` do plano são atualizados.
* **Reduzir abaixo do uso** nunca remove ninguém: bloqueia novas inclusões e a UI (`/app/equipe`, `get_company_seat_usage()`) mostra "usados / limite" e o aviso de excesso.

## 5. Sessões simultâneas

* Controle **de aplicação**; o Clerk continua dono das sessões. Registro `user_session_slots` (`allowed|blocked`).
* Fluxo: layout autenticado (`(app)` e `admin`) → `evaluateSessionGate()` (`src/lib/auth/session-gate.ts`) → lista de sessões **ativas** do Clerk (API server-side) → `register_session_slot(user, sid, ativas)` (service_role; trava advisory por usuário). Sessões que o Clerk já não lista liberam a vaga; sessões já aceitas **não são derrubadas**; a nova que excede o limite vai para `/acesso-sessoes` com a mensagem exigida e a lista de outras sessões (navegador/aparelho/cidade, nunca IP/token/cookie) para encerrar uma delas.
* Auditoria: `platform.session.limit_blocked` e `platform.session.revoked` (sem tokens/cookies).
* **Limitações**: (a) o gate roda nos layouts, não no middleware — Server Actions/rotas de API chamadas por uma sessão já bloqueada não são barradas individualmente; (b) falha de infraestrutura (Clerk/serviço) ⇒ **fail-open** (não derruba cliente por erro nosso); (c) a presença do claim `sid` no JWT do Supabase é **inferida** — a RPC de status cai para o `sid` do servidor.

## 6. Teste grátis por conexão (antifraude)

* Ponto de controle: onboarding `createCompanyAction` → `authorizeTrialSignup()` (`src/lib/security/trial-signup.ts`) → RPC `authorize_trial_signup` (service_role) → `create_company_with_owner` concede o teste **somente com autorização não consumida**. Chamada direta do cliente a `create_company_with_owner` cria a empresa **sem teste**.
* **O cadastro no Clerk não é bloqueado** (não há webhook do Clerk no projeto): a pessoa cria conta e empresa, mas, acima do limite, **sem o teste grátis**, vendo o aviso exigido em `/app/assinatura` (`get_my_trial_status`). Isso é deliberado e deve ser dito assim: não afirmamos bloqueio de signup.
* IP confiável (`src/lib/security/client-ip.ts`): só `x-vercel-forwarded-for`/`x-forwarded-for`/`x-real-ip` quando `VERCEL=1`; ou `TRUSTED_PROXY_HOPS` = nº de proxies confiáveis, contado **do fim** de `X-Forwarded-For`; caso contrário `null`. Cabeçalho forjado pelo cliente nunca é usado. IPv6 normalizado para /64.
* Dado mínimo: guarda-se `HMAC-SHA256(ip)` (segredo `ANTIFRAUD_HASH_SECRET`; se ausente, deriva-se do segredo do Clerk, também de servidor) — nunca o IP. Retenção limitada (`trial_signup_retention_days`) com limpeza oportunista. Contagem atômica (locks advisory conexão → usuário). Idempotente: repetir a chamada devolve a mesma decisão; o teste é concedido uma vez (`subscriptions.trial_claimed_by`).
* IP desconhecido ⇒ permite e registra (`ip_unknown`), para não punir quem pode ser legítimo. **Sem bloqueio permanente**: expira com a janela; admin revisa falso positivo ajustando limite/janela (configurações). Auditoria `platform.signup.trial_denied` guarda só os 8 primeiros caracteres do hash.
* Não há fingerprinting invasivo.

## 7. Ordem de implantação (importante)

A migration e o código devem ir **juntos**. Migration antes do código: o código antigo cria empresas sem teste (nenhuma autorização é registrada). Código antes da migration: `authorize_trial_signup` não existe ⇒ sem teste; o normalizador (`normalizePublicPlan`) tolera o formato antigo de `get_public_plans`, então a home não quebra. Em ambos os casos **ninguém é cobrado errado**, mas novos cadastros ficam sem teste até os dois lados coincidirem.

## 8. Variáveis de ambiente (nomes apenas)

`ANTIFRAUD_HASH_SECRET` (recomendado em produção), `TRUSTED_PROXY_HOPS` (só fora da Vercel), `SUPABASE_SERVICE_ROLE_KEY` e `CLERK_SECRET_KEY` (já existentes; servidor). Nenhuma é exposta ao navegador.

## 9. Rollback

Rodar `supabase/rollback/20261014000000_plans_management_and_usage_limits.down.sql` numa transação. Restaura o corpo original das 6 funções recriadas e remove os objetos novos. **Não restaura dados**: textos de benefício, campos comerciais, slots de sessão e eventos antifraude são perdidos; preços, assinaturas, pagamentos e entitlements não são tocados. Prova de reversibilidade (impressões digitais S0/S1/S2) no relatório.
