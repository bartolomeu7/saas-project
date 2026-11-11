-- =============================================================================
-- Cancelar a venda de um atendimento concluído reabre o agendamento.
-- Antes: a venda ficava cancelada e o agendamento continuava "Concluído" ligado a ela, sem saída.
-- Agora: o agendamento volta a "Agendado" e perde o vínculo com a venda cancelada (dá para concluir de novo).
-- Rollback: supabase/rollback/20261110180000_reopen_appointment_on_sale_cancel.down.sql
-- =============================================================================
create or replace function public.reopen_appointment_on_sale_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.appointments
       set status = 'scheduled', sale_id = null, cancellation_reason = null
     where sale_id = new.id and company_id = new.company_id and status = 'completed';
  end if;
  return new;
end;
$$;

revoke all on function public.reopen_appointment_on_sale_cancel() from public, anon, authenticated;

drop trigger if exists sales_reopen_appointment on public.sales;
create trigger sales_reopen_appointment
  after update of status on public.sales
  for each row execute function public.reopen_appointment_on_sale_cancel();
