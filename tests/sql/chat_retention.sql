-- =============================================================================
-- Bateria SQL — retenção do assistente de agenda. Rodar em uma CÓPIA do banco (ou no TEST) com
-- 20261125201000 aplicada. Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temp table t as
  select m.company_id co, m.user_id u, gen_random_uuid() old_s, gen_random_uuid() live_s
    from public.company_members m where m.role = 'owner' limit 1;

-- semeia sem o gatilho (senão a mensagem antiga seria limpa já na inserção)
alter table public.chat_messages disable trigger chat_messages_retention;
insert into public.chat_sessions (id, company_id, user_id, last_active_at) select old_s, co, u, now() - interval '120 days' from t;
insert into public.chat_sessions (id, company_id, user_id, last_active_at) select live_s, co, u, now() from t;
insert into public.chat_messages (session_id, company_id, user_id, role, kind, text, created_at)
  select old_s, co, u, 'user', 'text', 'antiga', now() - interval '91 days' from t;
create temp table dentro as select count(*) total from public.chat_messages where created_at >= now() - interval '90 days';
alter table public.chat_messages enable trigger chat_messages_retention;
-- uma mensagem nova dispara a limpeza
insert into public.chat_messages (session_id, company_id, user_id, role, kind, text) select live_s, co, u, 'user', 'text', 'nova' from t;

do $$
declare ok int := 0; fail text := '';
begin
  if not exists (select 1 from public.chat_messages where text = 'antiga' and session_id = (select old_s from t)) then ok := ok + 1; else fail := fail || ' mensagem antiga ficou;'; end if;
  if not exists (select 1 from public.chat_sessions where id = (select old_s from t)) then ok := ok + 1; else fail := fail || ' conversa antiga vazia ficou;'; end if;
  if exists (select 1 from public.chat_messages where text = 'nova' and session_id = (select live_s from t)) then ok := ok + 1; else fail := fail || ' mensagem nova sumiu;'; end if;
  if (select count(*) from public.chat_messages) = (select total from dentro) + 1 then ok := ok + 1; else fail := fail || ' apagou mensagem dentro do prazo;'; end if;
  if not has_function_privilege('authenticated', 'public.chat_prune_expired()', 'execute')
     and not has_function_privilege('anon', 'public.chat_prune_expired()', 'execute') then ok := ok + 1; else fail := fail || ' usuário consegue chamar a limpeza;'; end if;
  raise exception 'RESULT: % de 5 ok%', ok, case when fail = '' then '' else ' | FALHAS:' || fail end;
end $$;
rollback;
