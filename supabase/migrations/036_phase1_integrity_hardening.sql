-- Phase 1: integrity/RLS/grant hardening
-- Vercel intentionally out of scope.

drop policy if exists audit_logs_insert_own_company on public.audit_logs;
drop policy if exists sale_items_insert_own_company on public.sale_items;
drop policy if exists sale_items_update_own_company on public.sale_items;
drop policy if exists sale_items_insert_draft_only on public.sale_items;
drop policy if exists sale_items_update_draft_only on public.sale_items;

create policy sale_items_insert_draft_only on public.sale_items for insert to authenticated
with check (
  company_id in (select cm.company_id from public.company_members cm where cm.user_id=(select auth.uid()))
  and exists (select 1 from public.sales s where s.id=sale_items.sale_id and s.company_id=sale_items.company_id and s.status='draft'::public.sale_status)
);
create policy sale_items_update_draft_only on public.sale_items for update to authenticated
using (
  company_id in (select cm.company_id from public.company_members cm where cm.user_id=(select auth.uid()))
  and exists (select 1 from public.sales s where s.id=sale_items.sale_id and s.company_id=sale_items.company_id and s.status='draft'::public.sale_status)
)
with check (
  company_id in (select cm.company_id from public.company_members cm where cm.user_id=(select auth.uid()))
  and exists (select 1 from public.sales s where s.id=sale_items.sale_id and s.company_id=sale_items.company_id and s.status='draft'::public.sale_status)
);

drop policy if exists sale_payments_insert_own_company on public.sale_payments;
drop policy if exists sale_payments_update_own_company on public.sale_payments;

drop policy if exists loyalty_campaigns_insert_own_company on public.loyalty_campaigns;
drop policy if exists loyalty_campaigns_update_own_company on public.loyalty_campaigns;
drop policy if exists loyalty_campaigns_delete_own_company on public.loyalty_campaigns;
drop policy if exists loyalty_campaigns_insert_owner_admin on public.loyalty_campaigns;
drop policy if exists loyalty_campaigns_update_owner_admin on public.loyalty_campaigns;
drop policy if exists loyalty_campaigns_delete_owner_admin on public.loyalty_campaigns;

create policy loyalty_campaigns_insert_owner_admin on public.loyalty_campaigns for insert to authenticated
with check (exists (select 1 from public.company_members cm where cm.company_id=loyalty_campaigns.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner'::public.company_role,'admin'::public.company_role)));
create policy loyalty_campaigns_update_owner_admin on public.loyalty_campaigns for update to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=loyalty_campaigns.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner'::public.company_role,'admin'::public.company_role)))
with check (exists (select 1 from public.company_members cm where cm.company_id=loyalty_campaigns.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner'::public.company_role,'admin'::public.company_role)));
create policy loyalty_campaigns_delete_owner_admin on public.loyalty_campaigns for delete to authenticated
using (exists (select 1 from public.company_members cm where cm.company_id=loyalty_campaigns.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner'::public.company_role,'admin'::public.company_role)));

drop policy if exists sales_insert_own_company on public.sales;
drop policy if exists sales_insert_draft_own_company on public.sales;
create policy sales_insert_draft_own_company on public.sales for insert to authenticated
with check (
  company_id in (select cm.company_id from public.company_members cm where cm.user_id=(select auth.uid()))
  and user_id=(select auth.uid())
  and status='draft'::public.sale_status
);

create or replace function public.guard_direct_critical_mutations()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if current_user<>'postgres' then
    if tg_table_name='products' and new.stock_quantity is distinct from old.stock_quantity then
      raise exception 'Alteração de estoque deve usar uma operação de estoque autorizada.';
    end if;
    if tg_table_name='sales' and (
      new.user_id is distinct from old.user_id or new.status is distinct from old.status or
      new.payment_status is distinct from old.payment_status or new.subtotal is distinct from old.subtotal or
      new.total_amount is distinct from old.total_amount or new.total_cost is distinct from old.total_cost or
      new.estimated_margin is distinct from old.estimated_margin or new.sold_at is distinct from old.sold_at or
      new.completed_at is distinct from old.completed_at or new.cancelled_at is distinct from old.cancelled_at or
      new.cancelled_by is distinct from old.cancelled_by or new.cancelled_reason is distinct from old.cancelled_reason or
      new.loyalty_points_redeemed is distinct from old.loyalty_points_redeemed or
      new.loyalty_discount_amount is distinct from old.loyalty_discount_amount
    ) then raise exception 'Campos críticos da venda só podem ser alterados por operações autorizadas.'; end if;
  end if;
  return new;
end; $$;

drop trigger if exists products_guard_direct_critical_mutations on public.products;
create trigger products_guard_direct_critical_mutations before update on public.products for each row execute function public.guard_direct_critical_mutations();
drop trigger if exists sales_guard_direct_critical_mutations on public.sales;
create trigger sales_guard_direct_critical_mutations before update on public.sales for each row execute function public.guard_direct_critical_mutations();

drop trigger if exists audit_logs_record_stock_movement on public.audit_logs;
drop function if exists public.record_stock_movement_from_audit();

revoke all on function public.guard_direct_critical_mutations() from public,anon,authenticated;
grant execute on function public.guard_direct_critical_mutations() to postgres,service_role;
revoke execute on function public.receive_sale_payment(uuid,numeric,public.sale_payment_method,timestamptz,text) from anon;
revoke all on function public.create_cash_movement_from_sale_payment() from anon,authenticated;
revoke all on function public.handle_sale_status_change_for_loyalty() from anon,authenticated;
revoke all on function public.rls_auto_enable() from public,anon,authenticated;
revoke execute on function public.create_cost_center(text) from anon;
revoke execute on function public.create_financial_category(text,public.financial_category_kind) from anon;
revoke execute on function public.create_financial_entry(public.financial_entry_direction,text,numeric,date,public.sale_payment_method,uuid,uuid,text) from anon;
revoke execute on function public.pay_accounts_payable(uuid,numeric,public.sale_payment_method,date,text) from anon;