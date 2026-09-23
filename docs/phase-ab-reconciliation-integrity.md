# Fases A e B — Reconciliação e Integridade

## Escopo

Implementação restrita ao GitHub + Supabase do Prime Ges. Vercel permanece fora do escopo.

## Fase A — Reconciliação

O Supabase já possuía as migrations 024–026 aplicadas no histórico live, mas os respectivos arquivos não estavam presentes no GitHub consultado. Os arquivos foram reconstruídos semanticamente a partir do schema e das funções efetivamente presentes no banco:

- `024_phase2_purchase_receiving_payables.sql`
- `025_harden_phase2_receipts.sql`
- `026_phase2_purchase_order_hardening.sql`

As migrations não foram reaplicadas no banco.

O branch também contém:

- 033–035 (Fase 6)
- 036–038 (hardening da Fase 1)
- migrations da Fase 2 RPC/RBAC/RLS/loyalty
- 039 (hardening transacional da Fase B)

`src/types/supabase.ts` foi regenerado a partir do schema atual do Supabase.

## Fase B — Integridade

### Estoque

Ajuste manual passou a usar `adjust_product_stock`, SECURITY DEFINER transacional, com:

- autenticação;
- empresa/role;
- bloqueio da linha do produto;
- alteração de estoque;
- movimento de estoque;
- auditoria;
- execução apenas por `authenticated`.

### Vendas

`complete_sale` e `cancel_sale` passaram a adquirir locks de produtos em ordem determinística (`product_id, id`) para reduzir risco de deadlock entre operações concorrentes.

### Pagamentos

`receive_sale_payment` mantém lock da venda antes de calcular o saldo, serializando pagamentos concorrentes e impedindo overpayment.

### Compras

`receive_purchase_order` mantém locks do pedido, itens e produtos. O cancelamento do recebimento foi ajustado para processar produtos em ordem determinística.

### Caixa

`open_cash_register` usa advisory lock por empresa; abertura/fechamento/movimentação usam locks de linha onde necessário.

### Financeiro

`pay_accounts_payable` bloqueia a conta a pagar e, para pagamento em dinheiro, o caixa aberto; `create_financial_entry` segue a mesma arquitetura para operações em dinheiro.

## Validação

- migration live `phase_b_integrity_hardening` aplicada com sucesso;
- RPCs críticos sem EXECUTE para anon/public;
- `audit_logs` sem INSERT direto para authenticated/anon;
- triggers de proteção de estoque/venda presentes;
- triggers de validação de vínculo de compras presentes;
- advisors revisados;
- CI GitHub disparado no PR #18.

O banco consultado possui membros, mas não possui produtos, vendas, pagamentos, compras, recebimentos, contas a pagar, caixas, lançamentos financeiros ou movimentos de estoque. Por isso, não foram criados dados artificiais de produção para testes transacionais.

## Próximo gate

Após o CI, executar testes de fluxo em ambiente com dados de teste controlados antes de considerar o PR apto para merge.
