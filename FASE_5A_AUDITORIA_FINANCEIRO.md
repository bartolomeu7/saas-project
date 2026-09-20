# FASE 5A — Auditoria e Descoberta do Módulo Financeiro

**Prime Ges** — Next.js 14 (App Router) + Supabase (Postgres/Auth) + Vercel
Projeto Supabase: `fpbcruinppjbwtinzrdg` (único ambiente — não há staging)
Auditoria realizada em: 2026-09-04
Natureza desta execução: **somente leitura**. Nenhum arquivo de código, schema, RPC, RLS, Server Action, migration ou navegação foi alterado.

> Convenção usada neste documento: ✅ EXISTENTE · ⚠️ PARCIAL · ❌ AUSENTE · 🔒 BLOQUEADO POR DECISÃO · 🔴 RISCO
> Toda afirmação é baseada em leitura direta do código-fonte e das migrations reais do repositório (`supabase/migrations/001` a `021`). Onde não foi possível confirmar o estado ao vivo do banco (esta sessão não teve acesso a execução de SQL contra o projeto Supabase), isso é declarado explicitamente como **NÃO DETERMINADO NESTA EXECUÇÃO**.

---

## 1. Sumário executivo

O Prime Ges hoje é um ERP para pequenos negócios com módulos **maduros e reais** de Clientes, Produtos, Serviços, Vendas (com pagamentos, descontos, cancelamento), Fidelidade (pontos com ledger completo) e Caixa (aberto/fechado, movimentações, recém aprovado na Fase 4). Paralelamente existe o **billing da própria plataforma** (assinatura do Prime Ges via Pix/EvoPay), que é um domínio **totalmente separado e não deve ser confundido com "Financeiro do cliente"**.

**Não existe hoje, em nenhuma forma, um módulo "Financeiro"** no sentido de contas a pagar/receber, despesas, receitas fora de vendas, centros de custo, DRE, fluxo de caixa consolidado, conciliação bancária ou fornecedores. O nav já reserva os slots `/app/financeiro` e `/app/relatorios` (ambos `enabled: false`, sem `page.tsx` correspondente) — ou seja, o produto já antecipa que esses serão **módulos distintos entre si e distintos de Caixa**, mas nenhum schema, RPC ou tela existe.

O que já existe é uma base arquitetural **excepcionalmente sólida** para construir Financeiro em cima: todo dado sensível é isolado por `company_id` via RLS no banco (nunca só na aplicação); toda escrita financeira relevante (Vendas, Caixa, Fidelidade, Billing da plataforma) passa por funções `SECURITY DEFINER` que travam a linha certa com `FOR UPDATE` antes de decidir e escrever, com índices únicos parciais como garantia adicional de banco contra duplicidade; e o ledger de Fidelidade (`loyalty_transactions`) é um exemplo já testado em produção de "livro-razão" append-only com FIFO, saldo reconciliável e reversão sem apagar histórico — exatamente o padrão que um livro-razão financeiro (Financeiro/Caixa) deveria seguir.

O principal risco não é técnico, é de **decisão de negócio ainda não tomada**: regime de caixa vs. competência, se Pix/cartão contam como "recebido" no ato ou só na liquidação, se haverá contas a pagar/receber, se o Caixa poderá gerar lançamentos financeiros ou permanecerá isolado. Nenhuma dessas perguntas tem resposta hoje no código — e não deveriam ser resolvidas por suposição.

Um achado de auditoria pontual, fora do escopo de implementação desta fase: dois arquivos de migration (`018_fix_sale_payment_status_staleness.sql` e `019_atomic_payment_confirmation.sql`) trazem, no próprio cabeçalho, o aviso `*** MIGRATION CRIADA, MAS NÃO APLICADA EM PRODUÇÃO NESTA SESSÃO ***`. Pela linha do tempo e pelo conteúdo desta sessão (ver seção 27), essas correções foram de fato aplicadas depois — `src/lib/billing/confirm-payment.ts` já chama `confirm_subscription_payment` (migration 019) em produção — mas o comentário nunca foi atualizado retroativamente. **Isso não foi confirmado por consulta SQL ao vivo nesta execução** (sem acesso a ferramentas de banco nesta sessão) — está marcado como recomendação de verificação antes da Fase 5B.

---

## 2. Arquitetura encontrada

```
Vercel (build + deploy)
   └── Next.js 14 App Router (React + TypeScript, Tailwind)
         ├── (public)   — landing, login, cadastro, forgot/reset password
         ├── (app)      — área autenticada: dashboard, clientes, produtos,
         │                serviços, vendas, fidelidade, caixa, assinatura
         ├── admin      — segmento real /admin (guard pronto, sem conteúdo)
         └── api/       — Route Handlers (webhook EvoPay)
   └── Supabase (Postgres 15+, Auth, Storage)
         ├── 21 migrations aplicadas (001 → 021), schema versionado
         ├── RLS habilitada em toda tabela desde a criação
         └── Funções SECURITY DEFINER para toda escrita sensível
```

- **Roteamento:** três *route groups*: `(public)`, `(app)`, e o segmento real `admin` (não é route group — o middleware intercepta pelo path literal `/admin`).
- **Middleware** (`src/middleware.ts` + `src/lib/supabase/middleware.ts`): renova sessão a cada request, decide se a rota exige autenticação, aplica o guard de assinatura (`src/lib/billing/guard.ts`) bloqueando `/app/*` para empresa sem assinatura ativa/trial válido, e aplica o guard de admin de plataforma (`src/lib/admin/guard.ts`) para `/admin/*`.
- **Autenticação:** Supabase Auth (e-mail/senha + Google OAuth), sessão via cookies, tudo por Server Actions (`src/lib/auth/actions.ts`).
- **Autorização (duas camadas totalmente separadas, nunca confundidas no código):**
  - `company_role` (`owner | admin | employee`) — papel **dentro de uma empresa cliente**, usado por Vendas/Caixa/Fidelidade.
  - `profiles.role` (`user | admin | super_admin`) — papel **na plataforma Prime Ges**, usado só pelo painel `/admin` (ainda sem conteúdo).
  Um owner de empresa cliente não é administrador da plataforma só por ser dono do próprio negócio — os dois nunca se misturam em nenhuma policy ou guard lido.
- **Multi-tenant:** `companies` ↔ `company_members` (`user_id`, `company_id`, `role`) ↔ toda tabela de negócio via `company_id`. `getCurrentCompany()` (`src/lib/companies/queries.ts:15`) é o único ponto que resolve "empresa atual" no código da aplicação — sempre a membership mais antiga (`order by created_at asc`, corrigido na migration 017 para determinismo).
- **Banco:** Postgres gerenciado pelo Supabase, schema 100% versionado em `supabase/migrations/`, RLS habilitada em toda tabela desde a criação (nunca "desabilitada para resolver depois").
- **Auditoria:** uma única tabela genérica `audit_logs` (`entity_type`/`entity_id`/`action`/`metadata jsonb`), reutilizada por todos os módulos — não há tabela de auditoria por domínio.
- **Billing da plataforma:** EvoPay (Pix), isolado em `src/lib/billing/`, webhook dedicado em `src/app/api/webhooks/evopay/route.ts`, nunca chamado do frontend.
- **Estoque, Financeiro, Relatórios, Configurações:** presentes no nav como placeholders desabilitados; nenhuma tabela, rota ou componente implementados.

---

## 3. Inventário de tabelas (todas com relação direta ou indireta a dinheiro)

| Tabela | Migration | Finalidade | Fonte de verdade? | Quem grava |
|---|---|---|---|---|
| `sales` | 008 | A venda — totais, status, payment_status, margem estimada | ✅ SIM (para a venda em si) | `complete_sale`/`cancel_sale` (RPC), Server Actions (rascunho) |
| `sale_items` | 008 | Itens da venda, snapshot de preço/custo | ✅ SIM (histórico do item) | Server Actions (`addSaleItemAction` etc.) |
| `sale_payments` | 008 | Pagamentos registrados para uma venda | ✅ SIM (pagamento recebido) | `addSalePaymentAction` (Server Action, client comum) |
| `products` | 006 | Catálogo — `cost_price`, `sale_price`, `stock_quantity` | ✅ SIM (preço/custo **atual**, não histórico) | Server Actions; `stock_quantity` também por `complete_sale`/`cancel_sale` |
| `services` | 007 | Catálogo de serviços — `cost_price`, `sale_price` | ✅ SIM (preço/custo atual) | Server Actions |
| `cash_registers` | 021 | Caixa: abertura/fechamento, saldo inicial/esperado/informado/diferença | ✅ SIM | `open_cash_register`/`close_cash_register` (RPC) |
| `cash_movements` | 021 | Movimentações de caixa (automáticas de venda + manuais) | ✅ SIM | `create_cash_movement` (RPC) + trigger `sale_payments_create_cash_movement` |
| `plans` | 009 (substitui 004, nunca aplicada) | Catálogo de planos da **plataforma** | ✅ SIM (referência) | seed + `service_role` |
| `subscriptions` | 009 | Assinatura atual de cada empresa **na plataforma** | ✅ SIM | `create_company_with_owner`, `confirm_subscription_payment` (ambas RPC) |
| `company_entitlements` | 009 | O que a empresa pode usar agora (derivada de `subscriptions`) | ⚠️ DERIVADA (nunca fonte primária sozinha) | mesmas RPCs acima |
| `subscription_payments` | 009 | Cobranças Pix da assinatura da plataforma | ✅ SIM | `confirm_subscription_payment` (RPC, só `service_role`) |
| `payment_events` | 009 | Log idempotente de webhook EvoPay | ✅ SIM (para idempotência) | mesma RPC, só `service_role` |
| `loyalty_accounts` | 012 | Saldo de pontos por cliente (cache reconciliável) | ⚠️ CACHE (fonte real é `loyalty_transactions`) | funções `SECURITY DEFINER` de fidelidade |
| `loyalty_transactions` | 012 | Ledger imutável de pontos — impacta `sales.discount_amount` | ✅ SIM (ledger) | idem |
| `audit_logs` | 005 | Log genérico de todos os módulos, incl. financeiros | ⚠️ PARCIAL (ver seção 24) | Server Actions/RPCs, **INSERT liberado ao client autenticado da própria empresa** |
| `companies` / `company_members` | 002 | Tenant e vínculo usuário↔empresa | ✅ SIM | `create_company_with_owner` (RPC) |
| `billing_customers` | 004 (rascunho **nunca aplicado**) | — | ❌ Não existe em produção (ver seção 27) | — |

**Falsos positivos** (nome soa financeiro, mas não é): `loyalty_settings.redemption_value_per_point`/`points_per_currency_unit` são taxas de **conversão de pontos**, não taxas financeiras; `sale_items.discount_amount` e `sales.discount_amount`/`loyalty_discount_amount` são descontos de venda, já mapeados; `subscription_payments.tax_amount`/`amount_with_tax` são a **taxa cobrada pela EvoPay sobre a cobrança Pix da assinatura da plataforma** (não um imposto sobre a venda do cliente).

**Zero resultado confirmado** para: `suppliers`/`fornecedores`, `accounts_payable`/`accounts_receivable`/`contas_a_pagar`/`contas_a_receber`, `expenses`/`despesas` (fora do que já existe em Vendas), `invoices`/`notas_fiscais`, `commissions`/`comissoes`, `taxes`/`impostos` (fora da taxa EvoPay citada acima), `cost_centers`/`centros_de_custo`. Nenhuma dessas tabelas existe em nenhuma migration.

---

## 4. Inventário de RPCs (`SECURITY DEFINER`) com relação financeira

| Função | Migration | Trava (`FOR UPDATE`) | Quem pode chamar |
|---|---|---|---|
| `create_company_with_owner(name, business_type)` | 002 → 009 → 016 → 017 | advisory lock por `user_id` (017) | `authenticated` |
| `complete_sale(sale_id)` | 008 → 014 | linha da `sales` | `authenticated` |
| `cancel_sale(sale_id, reason)` | 008 | linha da `sales` | `authenticated` (checa role internamente) |
| `redeem_loyalty_points(sale_id, points)` | 012 → 014 → 015 | `sales` + `loyalty_accounts` + lotes | `authenticated` |
| `adjust_loyalty_points(customer_id, points, reason)` | 012 | `loyalty_accounts` | `authenticated` (checa owner/admin internamente) |
| `undo_loyalty_redemption_for_draft_sale(sale_id)` | 013 | `sales` + `loyalty_accounts` | `authenticated` |
| `grant_loyalty_points_for_sale` / `reverse_loyalty_points_for_sale` / `expire_loyalty_points_batch` | 012 | (internas) | **ninguém via RPC** — só chamadas por trigger |
| `open_cash_register(opening_balance, notes)` | 021 | advisory lock por `company_id` | `authenticated` (checa owner/admin internamente) |
| `close_cash_register(cash_register_id, informed_balance, notes)` | 021 | linha da `cash_registers` | idem |
| `create_cash_movement(direction, amount, method, description)` | 021 | resolve o próprio caixa aberto do chamador — nunca aceita id de outra empresa | idem |
| `create_cash_movement_from_sale_payment()` (trigger function) | 021 | linha da `cash_registers` (`FOR UPDATE`) | ninguém via RPC — só trigger em `sale_payments` |
| `confirm_subscription_payment(...)` | 019 | linha do `subscription_payments` + linha da `subscriptions` | **só `service_role`** (nunca client) |
| `get_public_plans()` | 009 | — (read-only) | `anon`, `authenticated` |

Todas seguem o mesmo padrão de projeto: nunca confiam em valor calculado no frontend, recalculam a partir de dados reais, gravam `audit_logs` na mesma transação lógica (não é uma transação Postgres explícita cruzando múltiplos `INSERT`s de tabelas diferentes fora da própria função, mas cada função roda como uma única chamada SQL atômica).

---

## 5. Inventário de Server Actions com relação financeira

| Arquivo | Actions | O que fazem |
|---|---|---|
| `src/lib/sales/actions.ts` | `createSaleAction`, `updateDraftSaleAction`, `addSaleItemAction`, `updateSaleItemAction`, `removeSaleItemAction`, `addSalePaymentAction`, `completeSaleAction`, `cancelSaleAction` | Todo o ciclo de vida da venda. `addSalePaymentAction` é a única que **insere diretamente** em `sale_payments` (não via RPC) — protegida por RLS + reconferência pós-insert contra corrida (linhas 673–725). |
| `src/lib/cash-register/actions.ts` | `openCashRegisterAction`, `closeCashRegisterAction`, `createCashMovementAction` | Fininas — cada uma só valida formulário e chama a RPC correspondente. |
| `src/lib/loyalty/actions.ts` | `redeemLoyaltyPointsAction`, `adjustLoyaltyPointsAction`, `removeLoyaltyRedemptionFromDraftAction`, + CRUD de settings/tiers/multipliers/campaigns | Idem — finas, delegam a RPC. |
| `src/lib/billing/actions.ts` | criação de cobrança Pix, `checkPaymentNowAction` | Chama EvoPay + `confirmPaymentFromProvider` (que chama a RPC `confirm_subscription_payment` via `createAdminClient`). |
| `src/lib/products/actions.ts` / `src/lib/products/stock.ts` | CRUD de produto, ajuste manual de estoque | `cost_price`/`sale_price` só aqui — não têm histórico de alteração. |
| `src/lib/services/actions.ts` | CRUD de serviço | idem para `cost_price`/`sale_price` de serviço. |

**Nenhuma Server Action** escreve diretamente em `cash_registers`, `cash_movements`, `subscriptions`, `company_entitlements`, `subscription_payments` ou `payment_events` — todas passam por RPC ou por `createAdminClient()` (service_role, restrito ao servidor).

---

## 6. Inventário de queries com relação financeira

- `src/lib/sales/queries.ts`, `src/lib/sales/totals.ts` (`recalculateSaleTotals` — único caminho de escrita para `subtotal/discount_amount/total_amount/total_cost/estimated_margin` enquanto a venda é rascunho).
- `src/lib/cash-register/queries.ts` (`getCurrentOpenCashRegister`, `getLastClosedCashRegister`, `listCashMovements`, `summarizeCashMovements` — resumo calculado em código a partir dos movimentos já buscados, não uma segunda query agregada).
- `src/lib/billing/queries.ts`, `src/lib/billing/guard.ts` (`getActiveSubscription` — fonte central de "a empresa tem acesso?").
- `src/lib/loyalty/queries.ts`, `src/lib/loyalty/tiers.ts` (nível do cliente sempre **calculado em código** a partir de `lifetime_points`, nunca persistido).
- `src/lib/customers/ranking.ts` — ranking de clientes; **usa dados reais de vendas já existentes** hoje (não é mock), mas é um ranking de contagem/valor de compras, não um relatório financeiro formal.

---

## 7. Inventário de páginas/componentes com relação financeira

| Rota | Página | Papel |
|---|---|---|
| `/app/vendas`, `/app/vendas/nova`, `/app/vendas/[id]` | ✅ implementada | Listagem, criação, detalhe/pagamento/conclusão/cancelamento de venda |
| `/app/caixa` | ✅ implementada (Fase 4, menu ainda em avaliação até este ticket) | Abertura/fechamento/movimentações/resumo |
| `/app/assinatura`, `/planos`, `/historico`, `/pagamento/[id]` | ✅ implementada | Billing da **plataforma** — plano atual, trocar plano, histórico de cobranças, tela de pagamento Pix |
| `/app/fidelidade` | ✅ implementada | Configurações, multiplicadores, níveis, campanhas, resgate |
| `/app/produtos`, `/app/servicos` | ✅ implementada | Catálogo — preço/custo atuais, sem histórico |
| `/app/financeiro` | ❌ **sem `page.tsx`** — só existe como item de nav desabilitado | — |
| `/app/relatorios` | ❌ **sem `page.tsx`** — idem | — |
| `/app/estoque` | ❌ **sem `page.tsx`** — idem (estoque hoje vive só como coluna em `products`) | — |
| `/app/clientes/ranking` | ✅ implementada | Ranking de clientes por valor/quantidade de compras — o mais próximo de um "relatório" que existe hoje |

---

## 8. Vendas

**Onde o valor nasce:** `sale_items` (um item por produto/serviço, com `unit_price`/`unit_cost` **copiados do catálogo no momento em que o item é adicionado** — nunca recalculado depois, mesmo que o preço do produto mude).

**Onde é recalculado:** `recalculateSaleTotals()` (`src/lib/sales/totals.ts:58`) roda depois de toda mutação de item/desconto enquanto a venda é `draft`, somando `sale_items.total_amount` direto do banco (nunca confia em total vindo do frontend). Na conclusão, `complete_sale()` (RPC) **recalcula tudo de novo, a partir do zero**, ignorando qualquer coisa que a aplicação tenha calculado antes — é essa recomputação final que é gravada como definitiva.

**Onde é persistido:** `sales.subtotal/discount_amount/loyalty_discount_amount/total_amount/total_cost/estimated_margin` — todos denormalizados na própria linha da venda (nunca uma view/agregação calculada em tempo real na leitura).

**Pode ficar desatualizado?** Sim, historicamente já ficou — a migration 018 documenta e corrige exatamente esse cenário: `sales.payment_status` ficava preso em `paid` mesmo depois de o total da venda aumentar (item adicionado após pagamento) ou de um pagamento ser removido, porque o trigger original só observava `INSERT/UPDATE` em `sale_payments`, nunca `DELETE` nem mudança em `sales.total_amount`. A correção (trigger duplo, um em cada tabela) está no código; **aplicação em produção não confirmada nesta execução** (ver seção 27).

**Pagamento parcial:** suportado nativamente — `sale_payments` aceita múltiplas linhas por venda. `payment_status` só tem dois valores possíveis (`pending`/`paid`/`cancelled`/`refunded`, sem "partial"): uma venda com metade paga mostra `pending`, indistinguível de "nada pago" no campo em si — só a soma de `sale_payments.amount where status='paid'` revela quanto falta.

**Múltiplos pagamentos:** cada `sale_payments` é uma linha própria — `addSalePaymentAction` reconfere, **depois** do insert, se a soma dos pagamentos `paid` (em ordem de inserção) ainda cabe no total da venda, desfazendo (delete) o pagamento que estourou o limite se duas chamadas concorrentes passarem pela checagem antes de qualquer commitar (`src/lib/sales/actions.ts:673-725`).

**Cancelamento:** `cancel_sale()` (RPC) exige status `completed`, restaura estoque item a item, marca `cancelled`, grava motivo/quem/quando. **Nunca mexe em `sale_payments`** — o pagamento recebido continua com `status='paid'` para sempre. Ver seção 20.

**Venda sem caixa aberto:** o pagamento é inserido normalmente, a venda conclui normalmente — só não gera `cash_movement` (o trigger simplesmente retorna sem fazer nada quando não há caixa `open`). Comportamento **já aprovado explicitamente** nas Fases 4/4.1 desta mesma sessão — não deve ser "corrigido" sem nova decisão de negócio.

**Comissão / taxas:** ❌ Não existe nenhum campo, tabela ou lógica de comissão de vendedor nem de taxa cobrada sobre a venda (taxa de cartão, por exemplo) em nenhuma parte de Vendas.

---

## 9. Pagamentos

Dois domínios de "pagamento" que **nunca devem ser confundidos** (e não são, no código):

| | `sale_payments` | `subscription_payments` |
|---|---|---|
| Quem paga quem | Cliente final → empresa usuária do Prime Ges | Empresa usuária → Prime Ges (a plataforma) |
| Métodos | `cash \| pix \| debit \| credit \| other` | Só Pix (EvoPay) |
| Integra gateway? | ❌ Não — é só o **registro** do que a empresa recebeu, sem conciliação com banco/adquirente | ✅ Sim — EvoPay real, com `provider_transaction_id`, QR code, `end_to_end_id` |
| Idempotência de webhook | Não aplicável (não há webhook) | `payment_events` + `confirm_subscription_payment` (`FOR UPDATE`) |
| Reversão | `status` pode virar `cancelled`/`refunded`, mas **nenhum código do repositório atualmente grava esses dois valores** — são estados do enum sem caminho de escrita implementado | idem: enum tem `refunded`, sem fluxo de estorno real da EvoPay implementado |

Todos os métodos (`cash`, `pix`, `debit`, `credit`, `other`) são tratados **exatamente igual** por `sale_payments` — o campo `status='paid'` é o único gatilho para "contar como recebido" tanto em `payment_status` da venda quanto no Caixa. Não existe hoje nenhuma distinção de "cartão só conta como recebido após liquidação da adquirente" — é uma decisão de negócio em aberto (seção 32).

---

## 10. Caixa

Auditado sem alterar nada (módulo aprovado na Fase 4).

- **Um caixa aberto por empresa por vez** — garantido por índice único parcial `cash_registers_one_open_per_company` (`WHERE status='open'`), não só por lógica de aplicação.
- **Abertura/fechamento:** `open_cash_register`/`close_cash_register` (RPC, owner/admin apenas — checado dentro da função). `expected_cash_balance` é **sempre recomputado pelo banco no momento do fechamento**, nunca confiado do chamador — soma `cash_movements` com `method='cash'` daquele caixa (entradas menos saídas) mais o `opening_balance`.
- **Diferença:** `cash_difference = informed_cash_balance - expected_cash_balance`, sem nenhuma tolerância automática — qualquer diferença, por menor que seja, fica registrada.
- **Movimentações automáticas:** trigger `sale_payments_create_cash_movement` (`AFTER INSERT OR UPDATE OF status ON sale_payments`) — **QUANDO** `NEW.status = 'paid'` **E** existe um caixa `open` para aquela empresa naquele instante. Um índice único parcial (`cash_movements_sale_payment_unique`, `WHERE sale_payment_id IS NOT NULL`) garante que o mesmo `sale_payment` nunca gera duas movimentações, mesmo sob concorrência real (validado com `Promise.all` na Fase 4).
- **QUANDO NÃO passa para o Caixa:** (a) pagamento registrado sem nenhum caixa aberto; (b) qualquer operação de `subscriptions`/`subscription_payments` (billing da plataforma nunca toca o Caixa do cliente); (c) ajuste de estoque sem venda associada; (d) cancelamento de venda (nenhum estorno automático gerado).
- **Pix/cartão/dinheiro:** todos entram em `cash_movements` com o `method` original da venda. Só `method='cash'` entra no cálculo de `expected_cash_balance` (dinheiro físico) — os demais contam em `totalIn` (entradas financeiras totais) mas não no saldo físico da gaveta.

**As cinco camadas que o Caixa já distingue com precisão** (nenhuma confundida com outra no código):
1. **Dinheiro físico** = `expected_cash_balance`/`informed_cash_balance` (só `method='cash'`).
2. **Entradas financeiras (todas as formas)** = soma de `cash_movements.amount where direction='in'`, qualquer método.
3. **Movimentações do caixa** = toda linha de `cash_movements` (entrada ou saída, automática ou manual).
4. **Pagamentos registrados** = `sale_payments` — existe independentemente de o Caixa estar aberto ou não.
5. **Receita da empresa** = `sales.total_amount` de vendas `completed` — não é o mesmo que "dinheiro que entrou no caixa" nem "soma de `sale_payments`" (uma venda pode estar paga sem caixa aberto, ou parcialmente paga).

---

## 11. Billing da plataforma (assinatura do Prime Ges)

Totalmente isolado de "Financeiro do cliente":

- `plans`, `subscriptions`, `company_entitlements`, `subscription_payments`, `payment_events` — nenhuma dessas tabelas tem relação com o negócio da empresa cliente; todas descrevem a relação comercial **Prime Ges ↔ empresa cliente**, nunca **empresa cliente ↔ cliente final dela**.
- Fonte de verdade de acesso: `subscriptions.status` **e** `subscriptions.expires_at` sempre juntos (`getActiveSubscription`, `src/lib/billing/guard.ts:20`) — nunca confia só no status armazenado.
- `company_entitlements` é **derivada**, nunca a fonte primária isolada — sempre recalculada junto de `subscriptions` na mesma operação.
- Gateway: EvoPay, Pix. A Prime Ges absorve a taxa da EvoPay (`amount` = valor cheio do plano; `tax_amount`/`amount_with_tax` são informativos da cobrança, não repassados ao cliente).
- Renovação: `confirm_subscription_payment` (RPC, `service_role` apenas) trava a linha do pagamento com `FOR UPDATE` antes de decidir e escrever — corrige uma corrida real documentada (duas confirmações concorrentes do mesmo pagamento podiam conceder o dobro do período).
- **Nunca gera nenhuma linha em `cash_registers`/`cash_movements`/`sales`** — não existe nenhum ponto de código onde billing da plataforma e Financeiro do cliente se tocam.

---

## 12. Contas a receber

| Item | Status |
|---|---|
| Conceito de "conta a receber" (título futuro, não uma venda já paga) | ❌ AUSENTE |
| Parcela com vencimento | ❌ AUSENTE |
| Cliente devedor / saldo devedor | ❌ AUSENTE |
| Cobrança | ❌ AUSENTE |
| Baixa de recebimento | ⚠️ EXISTE EM OUTRO MÓDULO — `sale_payments` registra o que já foi pago, mas não existe conceito de "venda a prazo com saldo pendente rastreado como título" |
| Atraso / juros / multa | ❌ AUSENTE |
| Desconto por pagamento antecipado | ❌ AUSENTE |
| Recebimento parcial | ✅ EXISTE, mas dentro de Vendas — `sale_payments` múltiplos por venda, sem conceito de "parcela vencida" |
| Renegociação | ❌ AUSENTE |
| Estorno | ⚠️ PARCIAL — enum `sale_payment_status` tem `refunded`, sem fluxo de escrita implementado |
| Inadimplência | ❌ AUSENTE — não há noção de "venda com saldo pendente há X dias" |

Hoje, uma venda com `total_amount > soma dos pagamentos paid` fica com `payment_status='pending'` para sempre, sem vencimento, sem alerta, sem cobrança — é uma "conta a receber implícita e sem gestão", não uma feature.

---

## 13. Contas a pagar

| Item | Status |
|---|---|
| Fornecedores | ❌ AUSENTE (confirmado por varredura exaustiva — seção 18) |
| Despesas / contas | ❌ AUSENTE |
| Parcelas / vencimentos | ❌ AUSENTE |
| Pagamento / pagamento parcial | ❌ AUSENTE |
| Atraso / juros / multa | ❌ AUSENTE |
| Despesas recorrentes | ❌ AUSENTE |
| Despesas operacionais / administrativas / avulsas | ❌ AUSENTE |
| Custo de mercadoria (compra) | ⚠️ PARCIAL — `products.cost_price` existe (preço de custo **atual** do produto), mas não há registro de "compra do fornecedor X por Y" nem histórico de variação de custo |
| Impostos / taxas sobre a operação da empresa cliente | ❌ AUSENTE |

**Não existe absolutamente nada** de Contas a Pagar hoje — nem parcial. É 100% lacuna.

---

## 14. Receitas

- **Vendas:** ✅ `sales.total_amount` (vendas `completed`) é a receita real e única fonte usada hoje (dashboard `/app`, `src/lib/sales/queries.ts`).
- **Serviços:** ✅ Mesma tabela `sales`/`sale_items` — um item pode ser `service`, contabilizado exatamente igual a produto no total da venda.
- **Outras receitas** (ex.: receita não vinculada a uma venda): ❌ AUSENTE.
- **Recebimentos:** ✅ `sale_payments`, mas nota importante — **receita (regime de competência, quando a venda é concluída) e recebimento (regime de caixa, quando o dinheiro entra) já são conceitos tecnicamente distintos no schema hoje**, mesmo sem nenhuma tela dizer isso explicitamente (ver seção 21).

## 15. Despesas

Nenhuma estrutura existe fora de Vendas/Caixa:
- Não há categoria de despesa.
- A única forma de "sair dinheiro" registrada hoje é `cash_movements` com `direction='out'` — que é só o registro de **saída física do caixa** (sangria, por exemplo), sem categorização, sem vínculo a um fornecedor, sem competência.
- ❌ AUSENTE em qualquer outra forma.

---

## 16. Custos

- `products.cost_price` / `services.cost_price`: preço de custo **atual e único** por item — sem histórico de variação, sem custo médio ponderado, sem FIFO/LIFO de estoque.
- `sale_items.unit_cost`: **snapshot** do custo no momento em que o item foi adicionado à venda — nunca recalculado depois. Isso já garante que uma venda antiga permanece consistente mesmo que o custo do produto mude no cadastro hoje.
- `sales.total_cost` / `sales.estimated_margin`: somados/recalculados a partir de `sale_items` em `complete_sale()` — nunca a partir do catálogo atual.

**Risco de cálculo incorreto identificado:** nenhum — o padrão de snapshot em `sale_items.unit_cost` é exatamente a proteção correta contra o problema clássico ("o produto mudou de custo depois, o lucro histórico mudou junto"). O nome do campo (`estimated_margin`) já é honesto sobre o que representa: **não** é lucro líquido, não desconta despesas operacionais/impostos/taxas — só receita menos custo snapshot dos itens.

---

## 17. Lucro e margem

- `estimated_margin = total_amount - total_cost` — margem **bruta**, por venda, persistida.
- Percentual de margem: **nunca armazenado** — sempre calculado em código a partir de `estimated_margin / total_amount` (mesmo padrão em Produtos/Serviços, calculado a partir de `sale_price`/`cost_price`).
- **Lucro líquido:** ❌ AUSENTE — não existe nenhum lugar do sistema que desconte despesas operacionais, impostos, taxas de cartão, ou qualquer coisa fora do custo direto do item.
- **Custo médio:** ❌ AUSENTE — `products.cost_price` é um valor único, não uma média ponderada de entradas.

---

## 18. Fornecedores

**Confirmado por varredura exaustiva** (leitura direta das migrations/código + busca de palavra-chave em todo `src/`, `supabase/migrations/`, `docs/`, READMEs): **zero** tabela, coluna, RPC, Server Action, componente ou página relacionada a fornecedores existe no repositório. A única ocorrência da palavra "fornecedor" em todo o código é um texto de exemplo (`placeholder`) do campo de descrição do lançamento manual de Caixa — `src/components/app/cash-movement-form.tsx:105`: `placeholder="Ex: sangria, suprimento, pagamento de fornecedor..."` — puramente ilustrativo, sem nenhuma entidade de fornecedor por trás.

- Cadastro de fornecedor: ❌ AUSENTE
- Compras / pedidos de compra: ❌ AUSENTE
- Custo de compra (distinto do `cost_price` de venda): ❌ AUSENTE
- Contas a pagar a fornecedor: ❌ AUSENTE
- Documentos de fornecedor: ❌ AUSENTE
- Histórico de relacionamento: ❌ AUSENTE

---

## 19. Relatórios

- `/app/relatorios`: item de nav `enabled: false`, **sem `page.tsx`** — acessar a URL hoje resultaria em 404 (nenhuma rota App Router definida para esse path).
- O mais próximo de um relatório real hoje é `/app/clientes/ranking` (`src/lib/customers/ranking.ts`) — ranking por valor/quantidade de compras, usando dados reais de `sales`, mas é uma feature de Clientes, não um módulo de Relatórios.
- O dashboard `/app` (`src/app/(app)/app/page.tsx`) mostra indicadores reais (vendas do mês, faturamento, ticket médio, produtos com estoque baixo) — cada seção busca do banco diretamente, sem cache/tabela intermediária, então **não há duas fontes calculando o mesmo indicador de formas diferentes hoje** (não há indicador duplicado porque não há indicador fora do dashboard ainda).
- Nenhum relatório financeiro formal (faturamento por período com filtros, DRE, fluxo de caixa) existe.

---

## 20. Cancelamento, estorno e reembolso

Distinção que o código já faz, mas que nenhuma tela ainda comunica explicitamente ao usuário:

**"Cancelar venda" (`cancel_sale`, existe):**
- Muda `sales.status` para `cancelled`.
- Restaura `products.stock_quantity` item a item.
- Reverte pontos de fidelidade ganhos/resgatados nessa venda (`reverse_loyalty_points_for_sale`).
- **NÃO** toca `sale_payments` — o pagamento continua `status='paid'` para sempre.
- **NÃO** gera nenhum movimento de estorno no Caixa — se a venda gerou uma entrada de R$100 no Caixa, essa entrada continua lá depois do cancelamento (validado empiricamente na Fase 4, seção 7 do relatório daquele bloco).

**"Devolver dinheiro" (não existe):**
- Não há nenhum caminho de código que credite de volta o cliente, gere uma saída de Caixa correspondente, ou marque `sale_payments.status='refunded'`.
- O enum `sale_payment_status` já tem o valor `refunded` — é **estrutura pronta, sem implementação**, não uma feature real.

Isso significa: hoje, cancelar uma venda paga em dinheiro deixa o Caixa "certo" no sentido contábil de "o dinheiro realmente está lá" (fisicamente ele ainda está na gaveta, porque ninguém devolveu), mas **incorreto** no sentido de "essa venda não deveria mais contar como receita" — a linha em `cash_movements` permanece como se a venda ainda fosse válida. Este é um comportamento **já aprovado explicitamente** como limitação conhecida nas Fases 3 e 4 desta sessão, e não deve ser alterado sem nova decisão de negócio.

---

## 21. Concorrência e integridade financeira

| Cenário | Classificação | Motivo |
|---|---|---|
| Dois pagamentos concorrentes na mesma venda (`addSalePaymentAction`) | 🟡 MÉDIO | Mitigado por reconferência pós-insert + delete do que estourou o limite (`src/lib/sales/actions.ts:673-725`) — funciona, mas é insert-otimista+compensação, não um lock prévio como o resto do sistema usa. Testado nesta sessão (Fase 3) com concorrência real via `Promise.all`. |
| Duas conclusões simultâneas da mesma venda (`complete_sale`) | 🟢 BAIXO | `FOR UPDATE` na linha da venda logo no início da função — a segunda chamada só continua depois que a primeira já commitou, e já vê `status <> 'draft'`. |
| Dois cancelamentos simultâneos da mesma venda | 🟢 BAIXO | Mesmo lock de `cancel_sale`. |
| Dois fechamentos de caixa simultâneos | 🟢 BAIXO | `FOR UPDATE` na linha do caixa em `close_cash_register` — validado com `Promise.all` real na Fase 4 (exatamente um sucesso, o outro recebe "Este caixa já está fechado."). |
| Duas aberturas de caixa simultâneas | 🟢 BAIXO | Índice único parcial `cash_registers_one_open_per_company` — validado com `Promise.all` real. |
| Dois lançamentos manuais de caixa simultâneos | 🟢 BAIXO | Não competem por recurso exclusivo — ambos inserem normalmente, sem risco de duplicidade (validado com `Promise.all`). |
| Duas vendas/pagamentos simultâneos gerando movimento de caixa | 🟢 BAIXO | `FOR UPDATE` na linha do caixa dentro do trigger + índice único por `sale_payment_id` — validado com `Promise.all` real. |
| Webhook duplicado da EvoPay / "Já paguei" clicado ao mesmo tempo do webhook | 🔴 **CRÍTICO — já corrigido no código, aplicação em produção NÃO confirmada nesta execução** | Migration 019 documenta que a versão anterior podia conceder o dobro do período pago. A correção (`confirm_subscription_payment`, `FOR UPDATE` + `payment_events`) está no código e é referenciada como já em uso por `confirm-payment.ts` — mas o próprio arquivo de migration diz "não aplicada nesta sessão" e esta auditoria não teve acesso a SQL ao vivo para confirmar. **Verificar antes de prosseguir para 5B.** |
| Retry de rede duplicando registro financeiro | 🟢 BAIXO (onde já mitigado) | Padrão de idempotência (`payment_events`, índices únicos parciais) cobre os fluxos críticos já identificados; não há garantia genérica para fluxos futuros que não sigam o mesmo padrão. |
| Duas alterações concorrentes de `min_lifetime_points` em níveis de fidelidade | 🟡 MÉDIO — já corrigido no código (migration 020), **aplicação em produção NÃO confirmada nesta execução** | Mesma situação de "criada mas potencialmente não aplicada" da 018/019. |

**Padrão geral observado:** toda operação financeira **nova** (Caixa, Fidelidade) segue rigorosamente "trava a linha certa com `FOR UPDATE` antes de ler+decidir+escrever". Vendas (mais antigo) usa o padrão mais fraco de "insert otimista + reconferência + compensação" em `sale_payments`, mas `complete_sale`/`cancel_sale` já usam `FOR UPDATE`. Não há, em nenhum lugar do código financeiro, um `SELECT` seguido de `UPDATE` separado sem lock nem reconferência — o padrão de risco "leitura, decide no app, escreve depois" que causou o bug documentado na migration 019 foi eliminado nesse ponto específico, mas o achado serve de alerta: **qualquer código financeiro futuro que não seguir esse padrão explicitamente está em risco de repetir o mesmo bug.**

---

## 22. Multi-tenant

Testado conceitualmente contra o código (não foi executado neste bloco — já validado empiricamente para Vendas/Caixa nas Fases 3 e 4 desta sessão, com sessões reais autenticadas, sem `service_role`):

- **Toda tabela financeira tem `company_id` e RLS habilitada.** Nenhuma exceção encontrada.
- **Isolamento é garantido no banco**, não só na aplicação — todas as policies de SELECT/INSERT/UPDATE usam `company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())`.
- **Autorização por papel (`owner/admin/employee`) nunca é feita em RLS** — sempre dentro das funções `SECURITY DEFINER` (checagem explícita de `company_role`) ou na Server Action. É um padrão consistente e deliberado em todo o código lido.
- **Pontos que dependem só da aplicação (não do banco):** nenhum encontrado para escrita — `cash_registers`/`cash_movements` não têm NENHUMA policy de INSERT/UPDATE/DELETE para `authenticated`, forçando toda escrita por RPC (que já checa `company_id` internamente). O mesmo vale para `loyalty_accounts`/`loyalty_transactions`.
- **`createAdminClient()` (service_role, ignora RLS):** usado em `src/lib/billing/confirm-payment.ts` (correto — webhook não tem sessão de usuário) e, de forma pontual e já documentada como decisão consciente na Fase 4 Bloco 3, em `src/lib/cash-register/queries.ts` (`resolveNames`) só para resolver nome de exibição de um `user_id` **já obtido de uma linha filtrada por RLS previamente** — nunca para decidir autorização nem para vazar dado cross-tenant.
- **Achado de dívida técnica (não é bug financeiro, mas é relevante para Financeiro):** `src/lib/sales/queries.ts` tem um padrão (`attachResponsibleNames`) que tenta resolver nomes de outros membros da empresa via client comum — sob RLS real (`profiles_select_own`, só a própria linha), isso **silenciosamente não resolve nomes de outros usuários** em Vendas. Já identificado nesta sessão (Fase 4 Bloco 3) como limitação pré-existente, fora do escopo do Caixa — mas se Financeiro precisar exibir "quem lançou" de forma confiável, vai herdar o mesmo problema a menos que use o mesmo padrão `createAdminClient()` já estabelecido no Caixa.

---

## 23. Segurança / RLS

- RLS habilitada em 100% das tabelas financeiras encontradas.
- **Discrepância de documentação encontrada** (não confirmada ao vivo — ver seção 27): `docs/architecture.md` afirma "RLS cross-empresa para admin/super_admin já existe em 7 tabelas (`billing_customers`, `subscriptions`, `company_entitlements`, `subscription_payments`, `audit_logs`, `customer_raffles`, `customer_raffle_entries`)". Pela leitura das migrations reais: `billing_customers` foi definida em `004_billing_foundation.sql`, mas o próprio cabeçalho de `009_billing_subscriptions.sql` diz que **004 nunca foi aplicada em produção** ("não aparece em nenhuma migration já rodada no banco real") — e a versão de `subscriptions`/`company_entitlements`/`subscription_payments` realmente aplicada (009) **não tem** a cláusula `OR EXISTS (... role in ('admin','super_admin'))` que a versão de 004 tinha. Ou seja: das 7 tabelas citadas na documentação, só 3 (`audit_logs`, `customer_raffles`, `customer_raffle_entries`, de `005`) parecem de fato ter esse bypass hoje; `billing_customers` provavelmente **não existe** na base real, e `subscriptions`/`company_entitlements`/`subscription_payments` provavelmente **não têm** acesso cross-empresa de admin via RLS. **Recomenda-se verificar isso com uma consulta real a `pg_policies` antes da Fase 5B** — se confirmado, é só uma correção de documentação (a aplicação/RLS em si não está quebrada, só o texto do doc está desatualizado); se o painel `/admin` algum dia precisar consultar assinaturas de qualquer empresa, vai precisar de uma policy nova ou de `service_role`.
- `payment_events` e as funções internas de fidelidade (`grant_loyalty_points_for_sale` etc.) **não são acessíveis via API pública em nenhuma hipótese** — nem policy de RLS, nem `GRANT EXECUTE` para `anon`/`authenticated`.

---

## 24. Auditoria

- `audit_logs` é **genérica e única** — não há tabela de auditoria por domínio financeiro.
- Responde hoje: **quem** (`actor_user_id`), **quando** (`created_at`), **qual empresa** (`company_id`), **qual registro** (`entity_type`+`entity_id`), **qual operação** (`action`, string livre por módulo).
- **Valor anterior/novo:** ⚠️ PARCIAL — só quando o call site específico decide colocar isso em `metadata` (jsonb livre). Exemplos que já fazem isso bem: `sale.stock_adjusted` grava `stock_before`/`stock_after`; eventos de fidelidade gravam `balance_after`. Não existe um mecanismo genérico de diff de linha (antes/depois) para qualquer UPDATE — é responsabilidade de cada função lembrar de incluir isso.
- **Motivo:** só quando a ação exige (ex.: `cancel_sale` grava `cancelled_reason`; `adjust_loyalty_points` exige `reason` obrigatório). Não é um campo estruturado da tabela — vive dentro de `metadata`.
- **IP/sessão:** ❌ AUSENTE — não há coluna `ip_address` nem `session_id`/`user_agent` em `audit_logs`.
- **Origem (server action vs RPC):** implícita pelo valor de `action`, não um campo dedicado.
- **Achado de risco (🟡 MÉDIO):** a policy de INSERT em `audit_logs` (`audit_logs_insert_own_company`, migration 005) permite que **qualquer usuário autenticado membro da empresa** insira uma linha, contanto que `company_id` seja o dele e `actor_user_id` seja ele mesmo (ou null). Não há nenhuma constraint que valide que `action`/`entity_type` correspondam a um evento real — a integridade de "esse log reflete um evento que de fato aconteceu" depende inteiramente da disciplina do código (só `writeAuditLog()` é chamado a partir de Server Actions confiáveis), não de uma garantia técnica do banco. Para um futuro módulo Financeiro onde auditoria pode ter peso legal/contábil, isso merece atenção: um cliente REST malicioso autenticado poderia, em teoria, inserir uma linha de auditoria falsa para a própria empresa (não cross-tenant, mas ainda assim um log não confiável).

---

## 25. Exportação e backup

- **Armazenamento:** 100% Postgres (Supabase) para dados estruturados; Supabase Storage só para `customer_documents` (arquivos anexados a clientes — PDF/imagem, até 10MB, bucket privado). Nenhum dado financeiro estruturado vive fora do Postgres hoje.
- **Dados críticos/históricos que precisam sobreviver a qualquer arquitetura futura de nuvem:** `sales`/`sale_items`/`sale_payments` (histórico de venda nunca é apagado, só `completed`/`cancelled`), `cash_registers`/`cash_movements` (histórico de caixa nunca apagado), `loyalty_transactions` (ledger imutável), `subscription_payments`/`payment_events` (histórico de cobrança da plataforma).
- **Regulatório/auditável:** nenhuma nota fiscal, nenhuma obrigação fiscal está implementada hoje — não há dado fiscal para reter além do que já existe (histórico de venda/pagamento).
- **Restaurável:** depende inteiramente do backup gerenciado pelo próprio Supabase (não há rotina de backup própria do Prime Ges encontrada no código).
- Nenhuma integração com armazenamento externo (Cloudflare R2 ou similar) existe hoje — fora do escopo desta fase, só documentando a dependência: qualquer arquitetura futura de retenção de longo prazo para dados financeiros vai precisar decidir se o histórico de `sales`/`cash_movements`/`loyalty_transactions` fica só no Postgres operacional ou também é replicado para um destino de arquivo frio.

---

## 26. Fonte de verdade por indicador

| Indicador | Fonte de verdade |
|---|---|
| Faturamento | `sales.total_amount` somado, filtrado por `status='completed'` |
| Pagamento recebido | `sale_payments` com `status='paid'` |
| Saldo físico de caixa | `cash_registers.expected_cash_balance` (calculado pelo banco a partir de `cash_movements` com `method='cash'`, nunca confiado do chamador) |
| Custo (de um item vendido) | `sale_items.unit_cost` (snapshot histórico) |
| Custo (atual, catálogo) | `products.cost_price` / `services.cost_price` |
| Lucro (margem bruta) | `sales.estimated_margin` (`total_amount - total_cost`) |
| Conta a receber | ❌ Não existe fonte — não há essa entidade |
| Conta a pagar | ❌ Não existe fonte — não há essa entidade |
| Despesa | ❌ Não existe fonte — não há essa entidade |
| Receita | `sales.total_amount` (mesma fonte de faturamento) |
| Saldo de pontos de fidelidade | `loyalty_accounts.balance` (cache), reconciliável somando `loyalty_transactions.points` |
| Assinatura ativa (plataforma) | `subscriptions.status` **+** `subscriptions.expires_at` juntos, nunca isolados |
| Direito de acesso atual (plataforma) | `company_entitlements` — sempre derivado de `subscriptions`, nunca fonte primária isolada |

Nenhuma duplicação de fonte de verdade foi encontrada para os indicadores que já existem — cada um tem exatamente um dono.

---

## 27. Dívida técnica e achados de auditoria

| # | Achado | Gravidade | Onde |
|---|---|---|---|
| 1 | Migrations 018, 019, 020 trazem `*** MIGRATION CRIADA, MAS NÃO APLICADA EM PRODUÇÃO NESTA SESSÃO ***` no cabeçalho, mas evidência de código atual (`confirm-payment.ts` chama `confirm_subscription_payment` diretamente, sem fallback) sugere fortemente que ao menos a 019 foi aplicada depois, sem atualizar o comentário. **Não confirmado por SQL ao vivo nesta execução.** | 🔴 ALTO (se 019 não estiver aplicada, a corrida de dobra-de-período documentada ainda existe em produção) | `supabase/migrations/018/019/020_*.sql` |
| 2 | `docs/architecture.md` descreve RLS admin cross-empresa em 7 tabelas, incluindo `billing_customers` (tabela de uma migration — 004 — que o próprio código sucessor diz nunca ter sido aplicada) e a versão antiga (com bypass de admin) de `subscriptions`/`company_entitlements`/`subscription_payments`, que foi substituída por 009 sem esse bypass. Documentação provavelmente desatualizada. | 🟡 MÉDIO (documentação, não comportamento) | `docs/architecture.md`, linha ~163 |
| 3 | `docs/architecture.md` não menciona o módulo Caixa (construído depois da última atualização do doc) — doc desatualizado em relação ao código. | 🟢 BAIXO | `docs/architecture.md` |
| 4 | `audit_logs` permite INSERT de qualquer membro autenticado da própria empresa, sem validação de que o evento é real — integridade depende só de disciplina de código, não de garantia de banco. | 🟡 MÉDIO | migration 005, policy `audit_logs_insert_own_company` |
| 5 | `sale_payment_status`/`subscription_payment_status` têm os valores `refunded`/`cancelled` no enum, mas nenhum caminho de código escreve esses valores — estrutura pronta, feature ausente. Um dev futuro pode assumir que "estorno já é suportado" só por ver o enum. | 🟢 BAIXO (mas gera confusão) | migrations 008, 009 |
| 6 | `attachResponsibleNames` em `src/lib/sales/queries.ts` não resolve nomes de outros membros sob RLS real (`profiles_select_own`) — silencioso, sem erro. Já documentado nesta sessão, fora do escopo de correção até agora. | 🟡 MÉDIO | `src/lib/sales/queries.ts` |
| 7 | `payment_status` não distingue "pendente" de "parcialmente pago" — mesmo enum value para ambos. Qualquer relatório futuro de "vendas com saldo pendente" vai precisar calcular isso derivando de `sale_payments`, não pode confiar só no enum. | 🟢 BAIXO | migration 008 |
| 8 | Nenhuma coluna `ip_address`/`session_id` em `audit_logs` — se Financeiro precisar de rastreabilidade mais forte (ex.: por exigência contábil), vai precisar de uma extensão de schema. | 🟢 BAIXO | migration 005 |
| 9 | **Confirmado por varredura exaustiva** (agente de busca dedicado, todo `src/`, `supabase/migrations/`, `docs/`, READMEs): zero matches reais para fornecedor/supplier, contas a pagar/receber, `accounts_payable`/`accounts_receivable`, comissão (exceto nota de escopo abaixo), imposto/tax (só em comentários de disclaimer da margem), DRE, fluxo de caixa, conciliação/reconciliation, `parcela`/installment financeiro, juros, multa, inadimplência, vencimento (financeiro). | — | — |
| 10 | `007_services.sql` (linhas 14 e 72) documenta explicitamente que **comissão foi excluída de propósito** do escopo do catálogo de Serviços ("sem OS, agenda, pagamento ou comissão") — não é um esquecimento, é uma decisão de escopo já registrada. | 🟢 BAIXO (informativo) | `supabase/migrations/007_services.sql:14,72` |
| 11 | Reembolso é **explicitamente** marcado como fora de escopo em dois lugares independentes: `021_cash_register_foundation.sql:36` (Caixa não tem refund financeiro real) e `src/lib/billing/mappers.ts:9-26` (o status `WAITING_FOR_REFUND` da EvoPay é mapeado para `"paid"`, com comentário "não implementar fluxo financeiro completo de reembolso"). Confirma a seção 20: a estrutura de enum existe, a feature não. | 🟢 BAIXO (informativo, já documentado no código) | `src/lib/billing/mappers.ts:9-26` |

---

## 28. Lacunas (visão consolidada)

❌ Contas a receber · ❌ Contas a pagar · ❌ Fornecedores · ❌ Despesas (fora de saída manual de Caixa) · ❌ Receitas fora de Vendas · ❌ Centros de custo · ❌ Categorias financeiras · ❌ Fluxo de caixa consolidado (multi-caixa, período) · ❌ DRE · ❌ Conciliação bancária · ❌ Relatórios financeiros formais · ❌ Estorno/reembolso real (só enum) · ❌ Comissão de vendedor · ❌ Impostos/taxas sobre venda · ❌ Custo médio ponderado / histórico de variação de custo · ❌ Distinção formal caixa vs. competência na UI (existe no schema, não na interface) · ❌ Módulo de Estoque dedicado (hoje é só uma coluna em `products`).

---

## 29–31. Escopo sugerido (MVP / Fase 2 / Futuro) — proposta para avaliação, não decisão

Esta seção é uma **proposta de sequenciamento técnico** para facilitar a decisão humana da seção 32 — não substitui nenhuma decisão de negócio ali listada.

**MVP (depende de decisões de negócio ainda não tomadas):**
- Visão financeira consolidada **somente leitura**, agregando o que já existe (Vendas + Caixa + Fidelidade), sem nenhuma tabela nova — puramente uma camada de relatório sobre dado já real.
- Contas a receber **básico**: derivar de `sales` com `payment_status='pending'`, sem tabela nova, mostrando "saldo pendente por venda" — depende da decisão "venda parcelada gera título formal ou continua implícita?" (seção 32).
- Relatórios financeiros simples (faturamento por período, por método de pagamento) — reaproveitando exatamente as mesmas queries que já alimentam o dashboard.

**Fase 2 (exige schema novo, mas segue os padrões já estabelecidos):**
- Contas a pagar (fornecedores, despesas, parcelas) — schema novo seguindo o padrão `company_id` + RLS + trigger `protect_company_id` já usado em toda tabela do projeto.
- Despesas categorizadas — reaproveitando o padrão de "categoria por empresa" já usado em `product_categories`/`service_categories`.
- Fornecedores — mesmo padrão de `customers` (cadastro simples, exclusão lógica).

**Futuro (depende de decisões estruturais maiores):**
- DRE, centros de custo, conciliação bancária, fechamento financeiro mensal, exportação contábil — todos dependem da decisão "competência, caixa, ou ambos?" (seção 32), que muda fundamentalmente o modelo de dados necessário.

**Dependências entre categorias:** Contas a Pagar não depende de Contas a Receber (podem ser construídas em qualquer ordem); ambas dependem de "categorias financeiras" existir primeiro se a decisão for ter categorização (senão, lançamento livre); DRE depende de Receitas + Despesas + Custos já existirem e estarem categorizados; fluxo de caixa consolidado depende do Caixa multi-registro (hoje é um caixa por vez) **se** a decisão for permitir múltiplos caixas simultâneos (fora de escopo desta auditoria decidir).

---

## 32. Decisões de negócio necessárias (perguntas, não respostas)

1. **Financeiro será por competência, caixa, ou ambos?** Consequência técnica: "ambos" exige guardar a data de competência (quando a venda foi feita) separada da data de caixa (quando o dinheiro efetivamente mudou de mãos) em toda transação — hoje `sales.completed_at` e `sale_payments.paid_at` já são campos distintos, então a base para "ambos" já existe estruturalmente, mas nenhum relatório os trata como dois regimes hoje.
2. **Venda parcelada gera conta a receber formal (título com vencimento)?** Se sim, precisa de tabela nova; se não, "saldo pendente" continua sendo só uma consulta derivada de `sale_payments`, sem parcela/vencimento/juros possível.
3. **Quando uma receita é reconhecida** — na conclusão da venda (`completed_at`, já existe) ou no recebimento total (`paid_at` do último pagamento)? Hoje o dashboard usa conclusão da venda.
4. **Pix recebido entra automaticamente como "recebido"?** Hoje sim, no ato do INSERT em `sale_payments` com `status='paid'` — não há liquidação simulada nem espera de confirmação bancária.
5. **Cartão entra como recebido imediatamente ou só após liquidação da adquirente?** Hoje, imediatamente (mesmo tratamento que dinheiro/Pix) — não há conceito de D+1/D+30 nem de taxa de adquirente descontada.
6. **Taxas de cartão serão contabilizadas?** Hoje não existe nenhum campo para isso em `sale_payments`.
7. **Haverá contas a pagar?** Zero estrutura hoje — decisão binária que define se Fase 2 inclui isso ou não.
8. **Haverá centros de custo?** Zero estrutura hoje.
9. **Haverá categorias financeiras?** Zero estrutura hoje (mas o padrão `product_categories`/`service_categories` já é reaproveitável).
10. **Haverá conciliação bancária?** Exigiria integração com extrato bancário/OFX — nada disso existe hoje, nem no billing da plataforma (EvoPay não expõe isso).
11. **Haverá fechamento mensal financeiro** (distinto do fechamento de Caixa, que já existe por turno)? Consequência técnica: precisaria de um período "trancado" onde lançamentos passados não podem mais ser alterados — não existe esse conceito hoje em nenhuma tabela.
12. **Como estornos serão tratados?** O enum já tem `refunded` pronto em dois lugares (`sale_payment_status`, `subscription_payment_status`) sem nenhuma implementação — decisão de negócio + implementação, não é 100% do zero.
13. **Como devoluções serão tratadas** — distinto de cancelamento de venda (já existe e não devolve dinheiro)? Precisa decidir se gera uma nova "venda negativa", uma tabela de devolução própria, ou uma extensão de `cancel_sale`.
14. **O Caixa continuará separado do Financeiro,** ou o Financeiro vai enxergar/consolidar os movimentos de Caixa? Se separado, Financeiro precisa de sua própria forma de saber "quanto entrou de dinheiro" sem duplicar `cash_movements`; se consolidado, precisa decidir se lê `cash_movements` diretamente ou se `cash_movements` passa a alimentar uma tabela financeira genérica.
15. **O Financeiro poderá gerar movimentações no Caixa** (ex.: uma despesa financeira paga em dinheiro vira uma saída de caixa automaticamente)? Se sim, é um segundo "gatilho automático" além do já existente (pagamento de venda) — precisa seguir o mesmo padrão de trigger + índice de idempotência para não duplicar o erro que a arquitetura atual evita cuidadosamente.
16. **Quem pode editar/cancelar lançamentos financeiros?** Hoje o padrão do projeto inteiro é: nunca edita, só reverte com um novo registro (ledger de fidelidade, Caixa imutável) — decisão é se Financeiro segue o mesmo padrão ou permite edição direta.
17. **Lançamentos financeiros serão imutáveis?** Recomendação implícita da arquitetura já existente (loyalty_transactions, cash_movements) é sim — mas é uma decisão, não um fato.
18. **Será possível excluir ou apenas estornar?** Nenhuma tabela financeira do projeto até hoje tem policy de DELETE real usada pela aplicação (mesmo onde a policy existe, por completude, o fluxo é sempre inativação/reversão) — precedente forte para "só estornar".
19. **Qual período histórico deve ser preservado?** Não há política de retenção/expurgo em nenhuma tabela hoje — tudo é mantido para sempre.
20. **Quais dados precisam entrar em backup de longo prazo** fora do backup padrão do Supabase? Não decidido; ver seção 25.

---

## 33. Dependências

- Financeiro **lê** de Vendas (`sales`, `sale_items`, `sale_payments`) e de Caixa (`cash_movements`) — não deveria duplicar nenhuma dessas tabelas.
- Financeiro **não deve** ser a segunda versão de Caixa (saldo físico de gaveta) nem de Vendas (registro de transação com cliente) — sua responsabilidade é a visão consolidada/histórica/categorizada que nenhum dos dois provê hoje.
- Contas a Pagar depende de Fornecedores existir primeiro (ou aceitar despesa sem fornecedor vinculado como caso válido).
- DRE depende de Receitas + Despesas + Custos existirem e estarem categorizados.
- Relatórios financeiros dependem de Financeiro ter dado real para consultar — construir Relatórios antes de qualquer schema financeiro novo só teria dado de Vendas/Caixa/Fidelidade para mostrar (o que já é possível hoje, sem esperar o módulo Financeiro).

---

## 34. Riscos

- 🔴 Migrations 018/019/020 com status de aplicação não confirmado nesta execução — risco de a corrida de "dobra de período de assinatura" (a mais grave já documentada no projeto) ainda existir em produção. **Ação recomendada antes de 5B: confirmar via consulta direta ao banco se `confirm_subscription_payment` (019), o trigger duplo de `payment_status` (018) e a constraint de `loyalty_tier_thresholds` (020) estão de fato aplicados.**
- 🟡 Construir Financeiro sem antes fechar as decisões da seção 32 arrisca repetir, num contexto de maior sensibilidade, o mesmo tipo de bug que a migration 019 documentou (regra decidida tarde demais, código já escrito sem lock adequado).
- 🟡 `audit_logs` sem garantia de integridade forte pode não ser suficiente se Financeiro tiver exigência de trilha de auditoria com peso contábil/legal.
- 🟢 Arquitetura de isolamento multi-tenant e de concorrência (padrão `FOR UPDATE` + índice único parcial) é sólida e replicável sem risco arquitetural novo.

---

## 35. Recomendação de arquitetura

1. **Financeiro como camada nova, não como extensão de Caixa ou Vendas.** Tabelas próprias (`financial_entries`/nome a definir, `accounts_payable`, `accounts_receivable` conforme decisão), sempre `company_id` + RLS + `protect_company_id` (trigger genérica já existente, reaproveitável sem modificação) + índice único parcial para qualquer garantia de "não duplicar" que a regra de negócio exigir.
2. **Seguir o padrão de ledger já validado em produção** (`loyalty_transactions`): append-only, saldo como cache reconciliável, reversão via nova linha (nunca UPDATE/DELETE de linha histórica), FIFO quando fizer sentido.
3. **Toda escrita financeira nova via função `SECURITY DEFINER`** com `FOR UPDATE` na linha certa antes de decidir — nunca replicar o padrão mais fraco de `sale_payments` (insert otimista + compensação), que só existe ali por ser código mais antigo.
4. **Nenhuma policy de INSERT/UPDATE/DELETE direta para `authenticated`** nas tabelas financeiras novas — mesmo padrão de `cash_registers`/`cash_movements`/`loyalty_accounts`: só RPC.
5. **Resolver as 20 perguntas da seção 32 antes de desenhar qualquer schema** — a arquitetura de dados muda fundamentalmente conforme a resposta a "competência, caixa, ou ambos" e "haverá contas a pagar/receber".
6. **Confirmar o estado real de aplicação das migrations 018/019/020** como primeiro passo técnico da Fase 5B, antes de qualquer coisa nova — é dívida de risco alto, não de baixo custo para verificar.

---

## Nota de transparência sobre esta execução

Um agente de busca (Explore) foi disparado em paralelo para uma varredura exaustiva de palavras-chave financeiras em todo o repositório (`src/`, `supabase/migrations/`, `docs/`, READMEs), como camada adicional de confirmação sobre o que já tinha sido lido diretamente por mim nas migrations e no código principal. **Concluído e incorporado neste relatório** (seções 13, 18 e 27): confirma, sem exceção, zero fornecedor/supplier real (só um texto de exemplo em `cash-movement-form.tsx`), zero contas a pagar/receber, zero comissão/imposto/DRE/fluxo de caixa/conciliação implementados, e confirma que tanto a exclusão de comissão (Serviços) quanto a não-implementação de reembolso (Caixa e Billing) já eram decisões de escopo explicitamente documentadas no próprio código, não lacunas silenciosas.

Esta sessão **não teve acesso a ferramentas de execução de SQL ao vivo contra o projeto Supabase** (`fpbcruinppjbwtinzrdg`) — todo o inventário de tabelas/RPCs/RLS acima vem da leitura direta dos arquivos de migration em `supabase/migrations/` e do código-fonte em `src/`, não de uma consulta ao schema real em produção. Onde a migration mais recente aplicável a um objeto está clara (por sucessão explícita nos comentários de cada arquivo), este relatório assume que é a versão real. Onde há ambiguidade (migrations 018/019/020 com aviso de "não aplicada nesta sessão"), isso foi marcado explicitamente como não determinado, com recomendação de verificação antes da Fase 5B.

---

**FASE 5A CONCLUÍDA — SOMENTE AUDITORIA. NENHUMA IMPLEMENTAÇÃO REALIZADA.**
