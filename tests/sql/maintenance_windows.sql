-- =============================================================================
-- Bateria SQL das janelas de manutenção (20261121000000_maintenance_windows) — TEST/local.
-- Tudo dentro de UMA transação com ROLLBACK: nada persiste. Rode DEPOIS de a migration estar aplicada
-- (ou concatene o corpo da migration antes, sem begin/commit). Imprime uma linha por verificação e o total de falhas.
-- =============================================================================
begin;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- atores: um super_admin, um admin comum e um usuário comum (reaproveita perfis reais só dentro da transação)
create temp table actors as
  select (select user_id from public.profiles where role = 'super_admin' and status = 'active' order by created_at limit 1) as super_id,
         (select user_id from public.profiles where role = 'user' and status = 'active' order by created_at limit 1) as user_id;
update public.profiles set clerk_user_id = 'mw_super' where user_id = (select super_id from actors);
update public.profiles set clerk_user_id = 'mw_user' where user_id = (select user_id from actors);

create temp table r (n serial, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
create temp table keep (k text primary key, v text);
grant all on keep to authenticated, anon;

create or replace function pg_temp.chk(l text, q text, e text) returns void language plpgsql as $$
declare v text; got text; pass boolean;
begin
  begin
    execute q into v;
    got := 'OK=' || coalesce(v, 'null');
  exception when others then
    got := 'ERR=' || sqlerrm;
  end;
  pass := case
    when e = 'OK' then got like 'OK=%'
    when e like 'OK=%' then got = e
    when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0
    else false end;
  insert into r(label, expect, got, ok) values (l, e, left(got, 140), pass);
end $$;
grant execute on function pg_temp.chk(text, text, text) to authenticated, anon;

-- ================================================================ acesso
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('anon lê o estado público', $$select (public.get_maintenance_public() ->> 'active') is null$$, 'OK=true');
select pg_temp.chk('anon NÃO agenda', $$select public.schedule_maintenance('Teste', 'Mensagem de teste', 'notice', now() + interval '1 day', now() + interval '1 day 1 hour')$$, 'ERR=permission denied');
select pg_temp.chk('anon NÃO lê a tabela', $$select count(*) from public.maintenance_windows$$, 'ERR=permission denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"mw_user"}', true);
select pg_temp.chk('usuário comum NÃO agenda', $$select public.schedule_maintenance('Teste', 'Mensagem de teste', 'notice', now() + interval '1 day', now() + interval '1 day 1 hour')$$, 'ERR=not authorized');
select pg_temp.chk('usuário comum NÃO inicia', $$select public.start_maintenance_now()$$, 'ERR=not authorized');
select pg_temp.chk('usuário comum NÃO lista', $$select public.list_maintenance_windows(5)$$, 'ERR=not authorized');
reset role;

-- ================================================================ super admin: validações
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"mw_super"}', true);
select pg_temp.chk('título curto', $$select public.schedule_maintenance('ab', 'Mensagem de teste', 'notice', now() + interval '1 day', now() + interval '1 day 1 hour')$$, 'ERR=título');
select pg_temp.chk('mensagem vazia', $$select public.schedule_maintenance('Título ok', '   ', 'notice', now() + interval '1 day', now() + interval '1 day 1 hour')$$, 'ERR=mensagem');
select pg_temp.chk('nível inválido', $$select public.schedule_maintenance('Título ok', 'Mensagem de teste', 'tudo', now() + interval '1 day', now() + interval '1 day 1 hour')$$, 'ERR=Nível');
select pg_temp.chk('início no passado', $$select public.schedule_maintenance('Título ok', 'Mensagem de teste', 'notice', now() - interval '1 hour', now() + interval '1 hour')$$, 'ERR=passado');
select pg_temp.chk('fim antes do início', $$select public.schedule_maintenance('Título ok', 'Mensagem de teste', 'notice', now() + interval '2 days', now() + interval '1 day')$$, 'ERR=depois do início');
select pg_temp.chk('mais de 24 h', $$select public.schedule_maintenance('Título ok', 'Mensagem de teste', 'blocked', now() + interval '2 days', now() + interval '4 days')$$, 'ERR=24 horas');
select pg_temp.chk('aviso 0 h', $$select public.schedule_maintenance('Título ok', 'Mensagem de teste', 'notice', now() + interval '2 days', now() + interval '2 days 1 hour', 0)$$, 'ERR=aviso');
select pg_temp.chk('contato 201', $$select public.schedule_maintenance('Título ok', 'Mensagem de teste', 'notice', now() + interval '2 days', now() + interval '2 days 1 hour', 48, repeat('x', 201))$$, 'ERR=contato');
select pg_temp.chk('mensagem 1001', $$select public.schedule_maintenance('Título ok', repeat('m', 1001), 'notice', now() + interval '2 days', now() + interval '2 days 1 hour')$$, 'ERR=mensagem');

-- ================================================================ agendar, editar, conflitos, cancelar
select pg_temp.chk('agenda válida (aviso em 3 dias)', $$select public.schedule_maintenance('Atualização', 'Vamos atualizar o sistema.', 'blocked', now() + interval '3 days', now() + interval '3 days 1 hour', 48, 'suporte@exemplo.com', 'nota interna')::text is not null$$, 'OK=true');
reset role;
insert into keep select 'w1', (select id::text from public.maintenance_windows where title = 'Atualização');
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"mw_super"}', true);
select pg_temp.chk('conflito de período', $$select public.schedule_maintenance('Outra', 'Mensagem de teste', 'notice', now() + interval '3 days 30 minutes', now() + interval '3 days 2 hours')$$, 'ERR=Já existe uma manutenção neste período');
select pg_temp.chk('encostada é permitida', $$select public.schedule_maintenance('Seguinte', 'Mensagem de teste', 'notice', now() + interval '3 days 1 hour', now() + interval '3 days 2 hours')::text is not null$$, 'OK=true');
select pg_temp.chk('aviso 48 h: ainda não aparece (faltam 3 dias)', $$select (public.get_maintenance_public() ->> 'upcoming') is null$$, 'OK=true');
select pg_temp.chk('edita agendada (aviso 100 h aparece)', format($$select public.update_maintenance(%L::uuid, 'Atualização', 'Vamos atualizar o sistema.', 'blocked', now() + interval '3 days', now() + interval '3 days 1 hour', 100, null, null)$$, (select v from keep where k = 'w1')), 'OK');
select pg_temp.chk('agora o aviso aparece', $$select (public.get_maintenance_public() -> 'upcoming' ->> 'title')$$, 'OK=Atualização');
select pg_temp.chk('estado público NÃO traz nota interna', $$select (public.get_maintenance_public() -> 'upcoming') ? 'internal_note'$$, 'OK=false');
select pg_temp.chk('cancela agendada', format($$select public.cancel_maintenance(%L::uuid, 'mudou o plano')$$, (select v from keep where k = 'w1')), 'OK');
select pg_temp.chk('cancelada some do aviso', $$select (public.get_maintenance_public() ->> 'upcoming') is null$$, 'OK=true');
select pg_temp.chk('não edita cancelada', format($$select public.update_maintenance(%L::uuid, 'Atualização', 'Vamos atualizar o sistema.', 'blocked', now() + interval '3 days', now() + interval '3 days 1 hour')$$, (select v from keep where k = 'w1')), 'ERR=ainda agendada');

-- ================================================================ iniciar agora (emergência), estender, encerrar
select pg_temp.chk('início agora com 3 minutos recusado', $$select public.start_maintenance_now('Emergência', 'Mensagem de emergência.', 'blocked', 3)$$, 'ERR=5 minutos');
select pg_temp.chk('início agora conflita com a "Seguinte" agendada (3 dias)? não (período diferente)', $$select public.start_maintenance_now('Emergência', 'Mensagem de emergência.', 'read_only', 30, 'WhatsApp 11 99999-0000')::text is not null$$, 'OK=true');
reset role;
insert into keep select 'w2', (select id::text from public.maintenance_windows where title = 'Emergência');
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"mw_super"}', true);
select pg_temp.chk('estado público: ativa e somente leitura', $$select (public.get_maintenance_public() -> 'active' ->> 'level')$$, 'OK=read_only');
select pg_temp.chk('estado público: contato aparece', $$select (public.get_maintenance_public() -> 'active' ->> 'contact_text')$$, 'OK=WhatsApp 11 99999-0000');
select pg_temp.chk('só uma ativa: segundo início recusado', $$select public.start_maintenance_now('Outra', 'Mensagem de teste.', 'blocked', 30)$$, 'ERR=em andamento');
select pg_temp.chk('estende 30 min', format($$select (public.extend_maintenance(%L::uuid, 30) > now() + interval '55 minutes')$$, (select v from keep where k = 'w2')), 'OK=true');
select pg_temp.chk('extensão de 2 min recusada', format($$select public.extend_maintenance(%L::uuid, 2)$$, (select v from keep where k = 'w2')), 'ERR=5 minutos');
select pg_temp.chk('não cancela a em andamento', format($$select public.cancel_maintenance(%L::uuid)$$, (select v from keep where k = 'w2')), 'ERR=Só dá para cancelar');
select pg_temp.chk('encerra', format($$select public.end_maintenance(%L::uuid)$$, (select v from keep where k = 'w2')), 'OK');
select pg_temp.chk('encerrada some do estado', $$select (public.get_maintenance_public() ->> 'active') is null$$, 'OK=true');
select pg_temp.chk('não encerra duas vezes', format($$select public.end_maintenance(%L::uuid)$$, (select v from keep where k = 'w2')), 'ERR=não está em andamento');
select pg_temp.chk('não estende encerrada', format($$select public.extend_maintenance(%L::uuid, 30)$$, (select v from keep where k = 'w2')), 'ERR=em andamento');

-- ================================================================ listagem e auditoria
select pg_temp.chk('lista traz as 3 janelas', $$select jsonb_array_length(public.list_maintenance_windows(10))$$, 'OK=3');
select pg_temp.chk('lista mostra a nota interna ao admin', $$select (public.list_maintenance_windows(10) -> 0) ? 'internal_note'$$, 'OK=true');
reset role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- ativação automática no horário: agendada que "chegou" entra em vigor; a que expirou sem começar é cancelada
insert into public.maintenance_windows (title, message, level, starts_at, expected_end_at, status)
  values ('Já devia ter começado', 'Mensagem de teste', 'blocked', now() - interval '5 minutes', now() + interval '25 minutes', 'scheduled');
insert into r(label, expect, got, ok)
  select 'horário chegou: entra em vigor sozinha', 'blocked', coalesce(public.get_maintenance_public() -> 'active' ->> 'level', 'nenhuma'),
         coalesce(public.get_maintenance_public() -> 'active' ->> 'level', 'nenhuma') = 'blocked';
update public.maintenance_windows set status = 'completed', ended_at = now() where status = 'active';
insert into public.maintenance_windows (title, message, level, starts_at, expected_end_at, status)
  values ('Expirada', 'Mensagem de teste', 'blocked', now() - interval '2 hours', now() - interval '1 hour', 'scheduled');
insert into r(label, expect, got, ok)
  select 'expirada sem começar é cancelada, não ativa', 'nenhuma', coalesce(public.get_maintenance_public() -> 'active' ->> 'level', 'nenhuma'),
         coalesce(public.get_maintenance_public() -> 'active' ->> 'level', 'nenhuma') = 'nenhuma';
insert into r(label, expect, got, ok)
  select 'auditoria gravada (agendar/editar/cancelar/iniciar/estender/encerrar)', '>=6',
         (select count(*)::text from public.audit_logs where action like 'platform.maintenance.%'),
         (select count(*) from public.audit_logs where action like 'platform.maintenance.%') >= 6;

select n, case when ok then 'OK ' else 'FALHA' end as res, label, case when ok then '' else 'esperado ' || expect || ' / veio ' || got end as detalhe from r order by n;
select count(*) filter (where not ok) as falhas, count(*) as total from r;

rollback;
