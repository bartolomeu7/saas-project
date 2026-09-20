-- Corrige sales.payment_status desatualizado.
--
-- Auditoria confirmada EMPIRICAMENTE nesta sessão (fixture isolada, sem
-- nenhuma alteração de schema, removida ao final): venda de R$100 com
-- pagamento de R$100 registrado corretamente vira 'paid' (o trigger
-- existente funciona para esse caso). Mas:
--   1) Ao simular um item adicionado depois do pagamento (UPDATE direto em
--      sales.total_amount para 130, exatamente o que
--      src/lib/sales/totals.ts:recalculateSaleTotals faz de verdade),
--      payment_status CONTINUOU mostrando 'paid' com apenas R$100 de
--      R$130 pagos.
--   2) Ao remover o pagamento (DELETE em sale_payments, o que acontece na
--      correção de corrida de addSalePaymentAction — src/lib/sales/actions.ts),
--      payment_status CONTINUOU mostrando 'paid' com R$0 pago.
--
-- Causa raiz: o trigger `sale_payments_recompute_status` (migration 008)
-- só está registrado para `AFTER INSERT OR UPDATE ON sale_payments` — nunca
-- para DELETE, e nunca para mudanças em `sales.total_amount` (que
-- acontecem por um caminho totalmente diferente, em outra tabela).
--
-- Correção: (a) adicionar DELETE ao trigger existente em sale_payments;
-- (b) um novo trigger em `sales`, disparado quando `total_amount` muda,
-- que recalcula payment_status da mesma forma. A função
-- `recompute_sale_payment_status()` já era genérica o suficiente (recebe
-- o sale_id a partir de NEW/OLD e sempre relê os dados do zero) — só
-- precisou de uma pequena adaptação para funcionar quando disparada a
-- partir de `sales` (onde NEW.id/OLD.id é o próprio id da venda, não
-- NEW.sale_id/OLD.sale_id).
--
-- *** MIGRATION CRIADA, MAS NÃO APLICADA EM PRODUÇÃO NESTA SESSÃO ***
-- Reprodução do bug (antes da correção) e o teste da correção em si estão
-- documentados no relatório final desta sessão. Aguardando autorização
-- para aplicar via `apply_migration` no projeto fpbcruinppjbwtinzrdg.

create or replace function public.recompute_sale_payment_status()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_total_amount numeric(12, 2);
  v_total_paid numeric(12, 2);
begin
  -- Disparado a partir de sale_payments: o id da venda vem de
  -- NEW.sale_id/OLD.sale_id. Disparado a partir de sales (novo trigger
  -- abaixo): o id da venda é o próprio NEW.id/OLD.id da linha.
  if tg_table_name = 'sale_payments' then
    v_sale_id := coalesce(new.sale_id, old.sale_id);
  else
    v_sale_id := coalesce(new.id, old.id);
  end if;

  select total_amount into v_total_amount from public.sales where id = v_sale_id;

  select coalesce(sum(amount), 0) into v_total_paid
    from public.sale_payments
    where sale_id = v_sale_id and status = 'paid';

  update public.sales
    set payment_status = case
      when v_total_amount > 0 and v_total_paid >= v_total_amount then 'paid'::public.sale_payment_status
      else 'pending'::public.sale_payment_status
    end
    where id = v_sale_id
      -- Evita disparo recursivo infinito do trigger de `sales` quando ele
      -- mesmo é quem faz este UPDATE (a condição do WHERE já garante que
      -- só grava quando o valor realmente muda, então o 2º disparo do
      -- trigger de sales não encontra nada para atualizar e para aí).
      and payment_status is distinct from (case
        when v_total_amount > 0 and v_total_paid >= v_total_amount then 'paid'::public.sale_payment_status
        else 'pending'::public.sale_payment_status
      end);

  return coalesce(new, old);
end;
$$;

-- sale_payments: adiciona DELETE (faltava) ao gatilho já existente.
drop trigger if exists sale_payments_recompute_status on public.sale_payments;
create trigger sale_payments_recompute_status
  after insert or update or delete on public.sale_payments
  for each row
  execute function public.recompute_sale_payment_status();

-- sales: novo gatilho — recalcula quando o total da venda muda (item
-- adicionado/removido, desconto manual ou de fidelidade alterado, etc.),
-- que é exatamente o caminho que src/lib/sales/totals.ts usa.
drop trigger if exists sales_recompute_payment_status on public.sales;
create trigger sales_recompute_payment_status
  after update of total_amount on public.sales
  for each row
  when (old.total_amount is distinct from new.total_amount)
  execute function public.recompute_sale_payment_status();

comment on function public.recompute_sale_payment_status() is
  'Recalcula sales.payment_status a partir da soma de sale_payments com status=paid comparada a sales.total_amount. Disparado por INSERT/UPDATE/DELETE em sale_payments E por UPDATE de sales.total_amount (migration 018) — antes só cobria mudanças em sale_payments, deixando payment_status desatualizado (preso em "paid" ou "pending" incorretamente) sempre que o total da venda mudava depois de um pagamento, ou quando um pagamento era removido.';
