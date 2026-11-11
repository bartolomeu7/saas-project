-- =============================================================================
-- Bateria SQL — Chat AI, contador de uso (20261111210000_chat_ai_usage_counter).
-- Roda SOMENTE no projeto TEST. Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.companies (id, name, business_type, status) values ('ffffffff-1000-0000-0000-0000000000f1', '[CUTEST] Empresa', 'bakery', 'active');
create temp table r (n serial, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon; grant all on sequence r_n_seq to authenticated, anon;
create or replace function pg_temp.chk(l text, q text, e text) returns void language plpgsql as $$
declare v text; got text;
begin
  begin execute q into v; got := 'OK=' || coalesce(v, 'null'); exception when others then got := 'ERR=' || sqlerrm; end;
  insert into r(label, expect, got, ok) values (l, e, left(got, 160), case when e like 'ERR=%' then got like 'ERR=%' and position(substr(e,5) in got) > 0 else got = e end);
end $$;
select pg_temp.chk('1a mensagem do dia = 1', $q$select public.chat_bump_usage('ffffffff-1000-0000-0000-0000000000f1', current_date)::text$q$, 'OK=1');
select pg_temp.chk('2a mensagem = 2', $q$select public.chat_bump_usage('ffffffff-1000-0000-0000-0000000000f1', current_date, 1, 350)::text$q$, 'OK=2');
select pg_temp.chk('3a mensagem = 3', $q$select public.chat_bump_usage('ffffffff-1000-0000-0000-0000000000f1', current_date)::text$q$, 'OK=3');
select pg_temp.chk('chamadas e tokens somados', $q$select llm_calls::text || '/' || llm_tokens::text from public.chat_usage where company_id = 'ffffffff-1000-0000-0000-0000000000f1' and day = current_date$q$, 'OK=1/350');
select pg_temp.chk('outro dia começa em 1', $q$select public.chat_bump_usage('ffffffff-1000-0000-0000-0000000000f1', current_date + 1)::text$q$, 'OK=1');
select pg_temp.chk('valores negativos não diminuem', $q$select public.chat_bump_usage('ffffffff-1000-0000-0000-0000000000f1', current_date, -5, -9)::text$q$, 'OK=4');
select pg_temp.chk('tokens continuam 350', $q$select llm_tokens::text from public.chat_usage where company_id = 'ffffffff-1000-0000-0000-0000000000f1' and day = current_date$q$, 'OK=350');
set local role authenticated;
select pg_temp.chk('authenticated NÃO chama', $q$select public.chat_bump_usage('ffffffff-1000-0000-0000-0000000000f1', current_date)$q$, 'ERR=permission denied');
reset role;
set local role anon;
select pg_temp.chk('anon NÃO chama', $q$select public.chat_bump_usage('ffffffff-1000-0000-0000-0000000000f1', current_date)$q$, 'ERR=permission denied');
reset role;
do $result$
declare v jsonb;
begin
  select jsonb_build_object('total', count(*), 'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)) into v from r;
  raise exception 'RESULT: %', v::text;
end
$result$;
