-- =============================================================================
-- Chat AI — contador de uso atômico (cota e custo). Só o servidor (service_role) chama.
-- Soma 1 mensagem (e, se informado, chamadas/tokens do modelo) no dia da empresa e devolve o total do dia DEPOIS da soma,
-- numa única instrução (sem corrida entre mensagens simultâneas).
-- Rollback: supabase/rollback/20261111210000_chat_ai_usage_counter.down.sql
-- =============================================================================
begin;

create or replace function public.chat_bump_usage(
  p_company_id uuid,
  p_day date,
  p_llm_calls integer default 0,
  p_llm_tokens bigint default 0
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_total integer;
begin
  insert into public.chat_usage (company_id, day, messages, llm_calls, llm_tokens)
  values (p_company_id, p_day, 1, greatest(coalesce(p_llm_calls, 0), 0), greatest(coalesce(p_llm_tokens, 0), 0))
  on conflict (company_id, day) do update
    set messages = public.chat_usage.messages + 1,
        llm_calls = public.chat_usage.llm_calls + greatest(coalesce(p_llm_calls, 0), 0),
        llm_tokens = public.chat_usage.llm_tokens + greatest(coalesce(p_llm_tokens, 0), 0)
  returning messages into v_total;
  return v_total;
end;
$$;

revoke all on function public.chat_bump_usage(uuid, date, integer, bigint) from public, anon, authenticated;
grant execute on function public.chat_bump_usage(uuid, date, integer, bigint) to service_role;

commit;
