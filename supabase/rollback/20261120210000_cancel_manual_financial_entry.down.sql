-- Reverte 20261120210000_cancel_manual_financial_entry.sql: remove a função de estorno.
-- Lançamentos já estornados continuam 'cancelled' (o estado é dado, não função).
begin;
drop function if exists public.cancel_manual_financial_entry(uuid, text);
commit;
