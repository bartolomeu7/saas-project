-- =============================================================================
-- Retenção do histórico de webhooks (somente TEST nesta fase)
--
-- O endpoint /api/webhooks/evopay é público e não assinado: qualquer um pode chamá-lo.
-- Para o histórico (webhook_deliveries) não crescer sem limite, entregas com mais de
-- 60 dias são removidas de forma oportunista (≈2% das inserções) por um trigger.
-- Só afeta observabilidade: pagamentos, eventos de idempotência (payment_events) e
-- auditoria NUNCA são tocados.
-- =============================================================================
create or replace function public.webhook_deliveries_prune()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if random() < 0.02 then
    delete from public.webhook_deliveries where received_at < now() - interval '60 days';
  end if;
  return null;
end;
$function$;
revoke all on function public.webhook_deliveries_prune() from public, anon, authenticated;

drop trigger if exists webhook_deliveries_prune_trigger on public.webhook_deliveries;
create trigger webhook_deliveries_prune_trigger
  after insert on public.webhook_deliveries
  for each statement execute function public.webhook_deliveries_prune();
