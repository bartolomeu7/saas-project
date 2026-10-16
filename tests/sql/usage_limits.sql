-- =============================================================================
-- Bateria SQL — limites de uso: vagas de usuário, sessões simultâneas e teste grátis por IP. SOMENTE no projeto TEST.
-- Uma transação que termina em erro proposital (RESULT: ...): nada persiste.
-- Requer 20261014000000_plans_management_and_usage_limits.sql aplicada.
-- Concorrência REAL (vários backends ao mesmo tempo) NÃO é exercitada aqui: ver tests/integration/edge.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

update public.profiles set clerk_user_id = 'ul_super' where user_id = '2068cbe0-ade1-41f6-8301-ddbe2cfcb1fb';
update public.profiles set clerk_user_id = 'ul_admin' where user_id = '5280eb70-5ca1-47f2-b154-9a47dbe0b021';
select set_config('app.platform_profile_write', 'on', true);
update public.profiles set role = 'admin' where user_id = '5280eb70-5ca1-47f2-b154-9a47dbe0b021';
select set_config('app.platform_profile_write', 'off', true);

-- usuários de teste: dono S, candidatos E1..E4, dono T, sessões SU/SV, cadastros T1..T9
insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status)
select ('dddddddd-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'ul_u' || g, 'UL Usuário ' || g, 'ul-u' || g || '@example.invalid', 'user', 'active'
  from generate_series(1, 30) g;
-- 1 = dono S; 2..5 = E1..E4; 6 = dono T; 7 = SU; 8 = SV; 11..19 = T1..T9; 20 = sem empresa

create temp table cos (k text primary key, id uuid);
insert into cos values ('s', gen_random_uuid()), ('t', gen_random_uuid()), ('noent', gen_random_uuid()), ('own2', gen_random_uuid());
insert into public.companies (id, name, business_type, status) select id, '[ULTEST] ' || k, 'other', 'active' from cos;
insert into public.company_members (company_id, user_id, role) values
  ((select id from cos where k = 's'), 'dddddddd-0000-0000-0000-000000000001', 'owner'),
  ((select id from cos where k = 't'), 'dddddddd-0000-0000-0000-000000000006', 'owner'),
  ((select id from cos where k = 'noent'), 'dddddddd-0000-0000-0000-000000000020', 'owner');
insert into public.company_entitlements (company_id, status, max_additional_users)
  select id, 'active', case k when 's' then 2 else 5 end from cos where k in ('s', 't');

create temp table r (n serial, grp text, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
grant all on cos to authenticated, anon;
create temp table base as select (select count(*) from public.subscriptions) subs, (select count(*) from public.company_entitlements) ents;
create or replace function pg_temp.co(k text) returns uuid language sql as $$ select id from cos where cos.k = $1 $$;
grant execute on function pg_temp.co(text) to authenticated, anon;
create or replace function pg_temp.u(i integer) returns uuid language sql as $$ select ('dddddddd-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid $$;
grant execute on function pg_temp.u(integer) to authenticated, anon;
create or replace function pg_temp.h(s text) returns text language sql as $$ select md5($1) || md5($1 || 'x') $$;
grant execute on function pg_temp.h(text) to authenticated, anon;
create or replace function pg_temp.chk(g text, l text, q text, e text) returns void language plpgsql as $$
declare v text; got text; pass boolean;
begin
  begin execute q into v; got := 'OK=' || coalesce(v, 'null');
  exception when others then got := 'ERR=' || sqlerrm; end;
  pass := case
    when e like 'OK=%' then got = e
    when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0
    else false end;
  insert into r(grp, label, expect, got, ok) values (g, l, e, left(got, 220), pass);
end $$;
grant execute on function pg_temp.chk(text, text, text, text) to authenticated, anon;
-- leituras sem RLS
create or replace function pg_temp.members(k text) returns integer language sql security definer as $$
  select count(*)::integer from public.company_members where company_id = (select id from cos where cos.k = $1) and role <> 'owner' $$;
grant execute on function pg_temp.members(text) to authenticated, anon;
create or replace function pg_temp.audit_n(p_action text, p_user integer) returns integer language sql security definer as $$
  select count(*)::integer from public.audit_logs where action = p_action and target_user_id = pg_temp.u(p_user) $$;
grant execute on function pg_temp.audit_n(text, integer) to authenticated, anon;
create or replace function pg_temp.sub_of(p_user integer) returns text language sql security definer as $$
  select coalesce((select s.status::text || ',' || (s.trial_claimed_by = pg_temp.u(p_user))::text
                     from public.subscriptions s join public.company_members m on m.company_id = s.company_id
                    where m.user_id = pg_temp.u(p_user) and m.role = 'owner'), 'sem_assinatura') $$;
grant execute on function pg_temp.sub_of(integer) to authenticated, anon;
create or replace function pg_temp.ev_consumed(p_user integer) returns integer language sql security definer as $$
  select count(*)::integer from public.trial_signup_events where user_id = pg_temp.u(p_user) and consumed_at is not null $$;
grant execute on function pg_temp.ev_consumed(integer) to authenticated, anon;
-- contagens volúteis (um subselect no MESMO comando enxerga o snapshot antigo; função volátil enxerga o que acabou de mudar)
create or replace function pg_temp.slot_n(p_sid text) returns integer language sql security definer as $$
  select count(*)::integer from public.user_session_slots where session_id = p_sid $$;
grant execute on function pg_temp.slot_n(text) to authenticated, anon;
create or replace function pg_temp.ev_hash_n(p_hash text) returns integer language sql security definer as $$
  select count(*)::integer from public.trial_signup_events where ip_hash = p_hash $$;
grant execute on function pg_temp.ev_hash_n(text) to authenticated, anon;
create or replace function pg_temp.ev_n(p_user integer, p_outcome text) returns integer language sql security definer as $$
  select count(*)::integer from public.trial_signup_events where user_id = pg_temp.u(p_user) and outcome = p_outcome $$;
grant execute on function pg_temp.ev_n(integer, text) to authenticated, anon;

-- ================================================================ VAGAS DE USUÁRIO
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ul_u1","role":"authenticated"}', true);
select pg_temp.chk('seats', 'uso inicial: 0 de 2 adicionais (3 pessoas com o proprietário)', $q$select (public.get_company_seat_usage())::text$q$,
  'OK={"at_limit": false, "over_limit": false, "total_used": 1, "total_allowed": 3, "additional_max": 2, "additional_used": 0}');
select pg_temp.chk('seats', 'dono adiciona o 1º colaborador (dentro do limite)', $q$select (public.add_existing_company_member('ul-u2@example.invalid', 'employee')).role::text$q$, 'OK=employee');
select pg_temp.chk('seats', 'dono adiciona o 2º colaborador (última vaga)', $q$select (public.add_existing_company_member('ul-u3@example.invalid', 'admin')).role::text$q$, 'OK=admin');
select pg_temp.chk('seats', 'uso: no limite', $q$select (public.get_company_seat_usage() ->> 'at_limit') || ',' || (public.get_company_seat_usage() ->> 'over_limit')$q$, 'OK=true,false');
select pg_temp.chk('seats', 'o 3º é RECUSADO pela RPC', $q$select (public.add_existing_company_member('ul-u4@example.invalid', 'employee')).role::text$q$, 'ERR=Limite de usuários do plano atingido');
select pg_temp.chk('seats', 'nenhum vínculo extra foi criado', $q$select pg_temp.members('s')::text$q$, 'OK=2');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('seats', 'BANCO: INSERT direto na última vaga (service_role, sem RPC) é recusado pelo gatilho', $q$insert into public.company_members(company_id, user_id, role) values (pg_temp.co('s'), pg_temp.u(4), 'employee') returning 'inserido'$q$, 'ERR=Limite de usuários do plano atingido');
select pg_temp.chk('seats', 'BANCO: transferir/duplicar via INSERT de admin também conta como vaga', $q$insert into public.company_members(company_id, user_id, role) values (pg_temp.co('s'), pg_temp.u(5), 'admin') returning 'inserido'$q$, 'ERR=Limite de usuários do plano atingido');
select pg_temp.chk('seats', 'o proprietário não ocupa vaga (INSERT de owner passa em empresa sem entitlement)', $q$insert into public.company_members(company_id, user_id, role) values (pg_temp.co('own2'), pg_temp.u(21), 'owner') returning 'inserido'$q$, 'OK=inserido');
select pg_temp.chk('seats', 'empresa SEM entitlements: limite 0 (nenhum colaborador)', $q$insert into public.company_members(company_id, user_id, role) values (pg_temp.co('noent'), pg_temp.u(22), 'employee') returning 'inserido'$q$, 'ERR=Limite de usuários do plano atingido');
select pg_temp.chk('seats', 'redução do limite (2 -> 1) com 2 usuários já cadastrados: NADA é excluído', $q$with u as (update public.company_entitlements set max_additional_users = 1 where company_id = pg_temp.co('s') returning 1) select count(*)::text || ',' || pg_temp.members('s')::text from u$q$, 'OK=1,2');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ul_u1","role":"authenticated"}', true);
select pg_temp.chk('seats', 'acima do limite: o painel informa over_limit e quanto está em uso', $q$select (public.get_company_seat_usage() ->> 'over_limit') || ',' || (public.get_company_seat_usage() ->> 'additional_used') || '/' || (public.get_company_seat_usage() ->> 'additional_max')$q$, 'OK=true,2/1');
select pg_temp.chk('seats', 'acima do limite: novas inclusões seguem bloqueadas', $q$select (public.add_existing_company_member('ul-u4@example.invalid', 'employee')).role::text$q$, 'ERR=Limite de usuários do plano atingido');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('seats', 'regularizar (limite 3) libera exatamente 1 vaga', $q$with u as (update public.company_entitlements set max_additional_users = 3 where company_id = pg_temp.co('s') returning 1) select count(*)::text from u$q$, 'OK=1');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ul_u1","role":"authenticated"}', true);
select pg_temp.chk('seats', 'com a vaga liberada, a inclusão volta a funcionar', $q$select (public.add_existing_company_member('ul-u4@example.invalid', 'employee')).role::text$q$, 'OK=employee');
select pg_temp.chk('seats', 'e a seguinte é recusada de novo', $q$select (public.add_existing_company_member('ul-u5@example.invalid', 'employee')).role::text$q$, 'ERR=Limite de usuários do plano atingido');
select set_config('request.jwt.claims', '{"sub":"ul_u6","role":"authenticated"}', true);
select pg_temp.chk('seats', 'isolamento: o dono da outra empresa vê o PRÓPRIO uso (0 de 5)', $q$select (public.get_company_seat_usage() ->> 'additional_used') || '/' || (public.get_company_seat_usage() ->> 'additional_max')$q$, 'OK=0/5');
select pg_temp.chk('seats', 'isolamento: não vê nem lista membros da empresa S', $q$select count(*)::text from public.company_members where company_id = pg_temp.co('s')$q$, 'OK=0');
select pg_temp.chk('seats', 'isolamento: UPDATE do limite de outra empresa por UPDATE direto (RLS)', $q$with u as (update public.company_entitlements set max_additional_users = 999 where company_id = pg_temp.co('s') returning 1) select count(*)::text from u$q$, 'OK=0');
select pg_temp.chk('seats', 'isolamento: nem do próprio entitlement', $q$with u as (update public.company_entitlements set max_additional_users = 999 where company_id = pg_temp.co('t') returning 1) select count(*)::text from u$q$, 'OK=0');
select pg_temp.chk('seats', 'isolamento: INSERT direto em empresa ALHEIA recebe mensagem uniforme (0), sem revelar o limite real (3) dela', $q$insert into public.company_members(company_id, user_id, role) values (pg_temp.co('s'), pg_temp.u(5), 'employee') returning 'x'$q$, 'ERR=Limite de usuários do plano atingido (0 usuário(s)');
select pg_temp.chk('seats', 'isolamento: a mesma recusa vale para um company_id inexistente (não distingue empresas)', $q$insert into public.company_members(company_id, user_id, role) values (gen_random_uuid(), pg_temp.u(5), 'employee') returning 'x'$q$, 'ERR=Limite de usuários do plano atingido (0 usuário(s)');
select set_config('request.jwt.claims', '{"sub":"ul_u30","role":"authenticated"}', true);
select pg_temp.chk('seats', 'usuário sem empresa não tem uso a consultar', $q$select (public.get_company_seat_usage())::text$q$, 'ERR=Nenhuma empresa encontrada');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('seats', 'anon NÃO consulta o uso', $q$select (public.get_company_seat_usage())::text$q$, 'ERR=permission denied');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ul_admin","role":"authenticated"}', true);
select pg_temp.chk('seats', 'admin da plataforma também respeita a vaga (admin_add_company_member)', $q$select (public.admin_add_company_member(pg_temp.co('s'), 'ul-u5@example.invalid', 'employee', 'tentativa acima do limite', gen_random_uuid()))::text$q$, 'ERR=Limite de usuários do plano atingido');

-- ================================================================ CONFIGURAÇÕES
select pg_temp.chk('settings', 'admin lê as 7 configurações (3 antigas + 4 novas)', $q$select count(*)::text from public.get_platform_settings()$q$, 'OK=7');
select pg_temp.chk('settings', 'padrões: sessões 3 / cadastros por IP 3 / janela 24 h / retenção 30 d', $q$select string_agg(value::text, '/' order by key) from public.get_platform_settings() where key in ('max_concurrent_sessions','trial_signup_ip_limit','trial_signup_ip_window_hours','trial_signup_retention_days')$q$, 'OK=3/3/24/30');
select pg_temp.chk('settings', 'admin NÃO altera o limite de sessões', $q$select public.set_platform_setting('max_concurrent_sessions', 10, 'x')::text$q$, 'ERR=not authorized');
select set_config('request.jwt.claims', '{"sub":"ul_super","role":"authenticated"}', true);
select pg_temp.chk('settings', 'super: sessões = 0 recusado', $q$select public.set_platform_setting('max_concurrent_sessions', 0, 'x')::text$q$, 'ERR=Valor fora do intervalo');
select pg_temp.chk('settings', 'super: sessões = 21 recusado', $q$select public.set_platform_setting('max_concurrent_sessions', 21, 'x')::text$q$, 'ERR=Valor fora do intervalo');
select pg_temp.chk('settings', 'super: cadastros por IP = 0 recusado (não dá para "desligar" a regra)', $q$select public.set_platform_setting('trial_signup_ip_limit', 0, 'x')::text$q$, 'ERR=Valor fora do intervalo');
select pg_temp.chk('settings', 'super: janela de 0 h ou 721 h recusada (sem janela indefinida)', $q$select public.set_platform_setting('trial_signup_ip_window_hours', 0, 'x')::text$q$, 'ERR=Valor fora do intervalo');
select pg_temp.chk('settings', 'super: janela 721 h recusada', $q$select public.set_platform_setting('trial_signup_ip_window_hours', 721, 'x')::text$q$, 'ERR=Valor fora do intervalo');
select pg_temp.chk('settings', 'super: retenção abaixo de 30 dias recusada', $q$select public.set_platform_setting('trial_signup_retention_days', 29, 'x')::text$q$, 'ERR=Valor fora do intervalo');
select pg_temp.chk('settings', 'super: chave inventada recusada', $q$select public.set_platform_setting('trial_signup_off', 1, 'x')::text$q$, 'ERR=Configuração desconhecida');
select pg_temp.chk('settings', 'super grava o padrão (3) sem erro', $q$select coalesce(public.set_platform_setting('max_concurrent_sessions', 3, 'padrão')::text, '')$q$, 'OK=');

-- ================================================================ SESSÕES SIMULTÂNEAS
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('sessions', '1ª sessão: permitida (1 de 3)', $q$select (public.register_session_slot(pg_temp.u(7), 'sess_a', array['sess_a']))::text$q$, 'OK={"limit": 3, "state": "allowed", "active": 1}');
select pg_temp.chk('sessions', '2ª sessão: permitida (2 de 3)', $q$select (public.register_session_slot(pg_temp.u(7), 'sess_b', array['sess_a','sess_b']) ->> 'active')$q$, 'OK=2');
select pg_temp.chk('sessions', '3ª sessão: permitida (3 de 3)', $q$select (public.register_session_slot(pg_temp.u(7), 'sess_c', array['sess_a','sess_b','sess_c']) ->> 'state')$q$, 'OK=allowed');
select pg_temp.chk('sessions', '4ª sessão: RECUSADA (limite 3) e as 3 existentes seguem válidas', $q$select (public.register_session_slot(pg_temp.u(7), 'sess_d', array['sess_a','sess_b','sess_c','sess_d']))::text$q$, 'OK={"limit": 3, "state": "blocked", "active": 3}');
select pg_temp.chk('sessions', 'repetir a 4ª não reabre a vaga nem duplica a auditoria', $q$select (public.register_session_slot(pg_temp.u(7), 'sess_d', array['sess_a','sess_b','sess_c','sess_d']) ->> 'state') || ',' || pg_temp.audit_n('platform.session.limit_blocked', 7)$q$, 'OK=blocked,1');
select pg_temp.chk('sessions', 'sessão já aceita continua aceita ao ser reverificada (idempotente)', $q$select (public.register_session_slot(pg_temp.u(7), 'sess_a', array['sess_a','sess_b','sess_c','sess_d']) ->> 'state')$q$, 'OK=allowed');
select pg_temp.chk('sessions', 'só existem 3 vagas ocupadas e 1 recusada', $q$select count(*) filter (where state = 'allowed')::text || '/' || count(*) filter (where state = 'blocked')::text from public.user_session_slots where user_id = pg_temp.u(7)$q$, 'OK=3/1');
select pg_temp.chk('sessions', 'sessão que NÃO está ativa no Clerk é "invalid" e não ocupa vaga', $q$select (public.register_session_slot(pg_temp.u(7), 'sess_x', array['sess_a','sess_b','sess_c','sess_d']) ->> 'state') || ',' || pg_temp.slot_n('sess_x')$q$, 'OK=invalid,0');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ul_u7","sid":"sess_a","role":"authenticated"}', true);
select pg_temp.chk('sessions', 'status via JWT (sid): aceita', $q$select public.session_slot_status() ->> 'state'$q$, 'OK=allowed');
select set_config('request.jwt.claims', '{"sub":"ul_u7","sid":"sess_d","role":"authenticated"}', true);
select pg_temp.chk('sessions', 'status via JWT (sid): recusada', $q$select public.session_slot_status() ->> 'state'$q$, 'OK=blocked');
select set_config('request.jwt.claims', '{"sub":"ul_u7","sid":"sess_zzz","role":"authenticated"}', true);
select pg_temp.chk('sessions', 'status de sessão nunca vista: "unknown" (o app então verifica no Clerk)', $q$select public.session_slot_status() ->> 'state'$q$, 'OK=unknown');
select set_config('request.jwt.claims', '{"sub":"ul_u7","role":"authenticated"}', true);
select pg_temp.chk('sessions', 'sem sid no token, usa o parâmetro (só enxerga as PRÓPRIAS sessões)', $q$select public.session_slot_status('sess_b') ->> 'state'$q$, 'OK=allowed');
select pg_temp.chk('sessions', 'sem sid e sem parâmetro: "unknown"', $q$select public.session_slot_status() ->> 'state'$q$, 'OK=unknown');
select set_config('request.jwt.claims', '{"sub":"ul_u8","sid":"sess_a","role":"authenticated"}', true);
select pg_temp.chk('sessions', 'outro usuário NÃO enxerga o estado de sessão alheia (mesmo sid)', $q$select public.session_slot_status() ->> 'state'$q$, 'OK=unknown');
select pg_temp.chk('sessions', 'authenticated NÃO registra sessão (nem a própria)', $q$select public.register_session_slot(pg_temp.u(8), 'sess_h', array['sess_h'])::text$q$, 'ERR=permission denied');
select pg_temp.chk('sessions', 'authenticated NÃO libera sessão', $q$select public.release_session_slot(pg_temp.u(7), 'sess_a')::text$q$, 'ERR=permission denied');
select pg_temp.chk('sessions', 'authenticated NÃO lê a tabela de sessões', $q$select count(*)::text from public.user_session_slots$q$, 'ERR=permission denied');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('sessions', 'anon NÃO consulta nem registra', $q$select public.session_slot_status('sess_a')::text$q$, 'ERR=permission denied');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- as vagas foram aceitas há minutos (a poda protege vagas com < 60 s: ver grupo 'session_race' em mission09.sql)
update public.user_session_slots set verified_at = now() - interval '2 minutes' where session_id in ('sess_a','sess_b','sess_c','sess_d');
select pg_temp.chk('sessions', 'uma sessão termina no Clerk (sess_b sai da lista): a vaga é liberada e a recusada entra', $q$select (public.register_session_slot(pg_temp.u(7), 'sess_d', array['sess_a','sess_c','sess_d']) ->> 'state') || ',' || pg_temp.slot_n('sess_b')$q$, 'OK=allowed,0');
select pg_temp.chk('sessions', 'limite 1 aplicado direto na configuração (sessões ativas seguem aceitas)', $q$with s as (insert into public.platform_settings(key, value, updated_at) values ('max_concurrent_sessions', '1', now()) on conflict (key) do update set value = excluded.value returning 1) select count(*)::text from s$q$, 'OK=1');
select pg_temp.chk('sessions', 'com limite 1: as 3 existentes continuam aceitas', $q$select (public.register_session_slot(pg_temp.u(7), 'sess_a', array['sess_a','sess_c','sess_d']) ->> 'state') || ',' || (public.register_session_slot(pg_temp.u(7), 'sess_c', array['sess_a','sess_c','sess_d']) ->> 'state')$q$, 'OK=allowed,allowed');
select pg_temp.chk('sessions', 'com limite 1: uma NOVA sessão é recusada', $q$select public.register_session_slot(pg_temp.u(7), 'sess_e', array['sess_a','sess_c','sess_d','sess_e']) ->> 'state'$q$, 'OK=blocked');
select pg_temp.chk('sessions', 'revogar uma sessão libera a vaga (release) e audita uma vez', $q$select public.release_session_slot(pg_temp.u(7), 'sess_a')::text || ',' || public.release_session_slot(pg_temp.u(7), 'sess_a')::text || ',' || pg_temp.audit_n('platform.session.revoked', 7)$q$, 'OK=true,false,1');
select pg_temp.chk('sessions', 'aumentar o limite (5) e re-verificar: a recusada passa', $q$with s as (update public.platform_settings set value = '5' where key = 'max_concurrent_sessions' returning 1) select (select count(*) from s)::text || ',' || (public.register_session_slot(pg_temp.u(7), 'sess_e', array['sess_c','sess_d','sess_e']) ->> 'state')$q$, 'OK=1,allowed');
select pg_temp.chk('sessions', 'session_id de OUTRO usuário é recusado (sem sequestro de vaga)', $q$select public.register_session_slot(pg_temp.u(8), 'sess_c', array['sess_c'])::text$q$, 'ERR=Sessão inválida');
select pg_temp.chk('sessions', 'parâmetros inválidos (id vazio / longo / usuário inexistente)', $q$select public.register_session_slot(pg_temp.u(7), '  ', array['x'])::text$q$, 'ERR=Parâmetros inválidos');
select pg_temp.chk('sessions', 'id de sessão com 201 caracteres', $q$select public.register_session_slot(pg_temp.u(7), repeat('x', 201), array[repeat('x', 201)])::text$q$, 'ERR=Parâmetros inválidos');
select pg_temp.chk('sessions', 'usuário inexistente', $q$select public.register_session_slot(gen_random_uuid(), 'x', array['x'])::text$q$, 'ERR=Usuário não encontrado');
insert into public.user_session_slots (session_id, user_id, state, last_seen_at) values ('sess_old', pg_temp.u(8), 'allowed', now() - interval '40 days');
select pg_temp.chk('sessions', 'higiene: sessões sem sinal há > 30 dias são removidas', $q$select (public.register_session_slot(pg_temp.u(7), 'sess_c', array['sess_c','sess_d','sess_e']) ->> 'state') || ',' || pg_temp.slot_n('sess_old')$q$, 'OK=allowed,0');
select pg_temp.chk('sessions', 'auditoria de sessão NÃO contém o id da sessão, token nem cookie', $q$select count(*)::text from public.audit_logs where action like 'platform.session.%' and metadata::text ~* '(sess_|token|cookie|jwt)'$q$, 'OK=0');
select pg_temp.chk('sessions', 'a conta dona dos eventos é a do alvo (sem vazar para outras)', $q$select count(*)::text from public.audit_logs where action like 'platform.session.%' and target_user_id <> pg_temp.u(7)$q$, 'OK=0');

-- ================================================================ TESTE GRÁTIS: ANTIFRAUDE POR CONEXÃO
reset role;
delete from public.platform_settings where key = 'max_concurrent_sessions';
select pg_temp.chk('trial', 'cadastro 1 na conexão H1: autorizado', $q$select (public.authorize_trial_signup(pg_temp.u(11), pg_temp.h('ip1')) ->> 'allowed') || ',' || (public.authorize_trial_signup(pg_temp.u(11), pg_temp.h('ip1')) ->> 'replayed')$q$, 'OK=true,true');
select pg_temp.chk('trial', 'cadastro 2 e 3 na mesma conexão: autorizados', $q$select (public.authorize_trial_signup(pg_temp.u(12), pg_temp.h('ip1')) ->> 'allowed') || ',' || (public.authorize_trial_signup(pg_temp.u(13), pg_temp.h('ip1')) ->> 'allowed')$q$, 'OK=true,true');
select pg_temp.chk('trial', 'cadastro 4 na mesma conexão: NEGADO (limite 3 / 24 h)', $q$select (public.authorize_trial_signup(pg_temp.u(14), pg_temp.h('ip1')))::text$q$, 'OK={"limit": 3, "reason": "ip_limit", "allowed": false, "window_hours": 24}');
select pg_temp.chk('trial', 'a negativa é idempotente (repetir não duplica evento nem auditoria)', $q$select (public.authorize_trial_signup(pg_temp.u(14), pg_temp.h('ip1')) ->> 'replayed') || ',' || pg_temp.ev_n(14, 'denied_ip_limit') || ',' || pg_temp.audit_n('platform.signup.trial_denied', 14)$q$, 'OK=true,1,1');
select pg_temp.chk('trial', 'a auditoria guarda só um prefixo do identificador (nunca o IP nem o hash inteiro)', $q$select (length(metadata ->> 'ip_ref') = 8 and not (metadata::text like '%' || pg_temp.h('ip1') || '%'))::text from public.audit_logs where action = 'platform.signup.trial_denied' and target_user_id = pg_temp.u(14)$q$, 'OK=true');
select pg_temp.chk('trial', 'outra conexão (H2) não é afetada: autorizada', $q$select (public.authorize_trial_signup(pg_temp.u(15), pg_temp.h('ip2')) ->> 'allowed')$q$, 'OK=true');
select pg_temp.chk('trial', 'IP compartilhado: o mesmo usuário reaproveitando a conexão não conta duas vezes', $q$select (public.authorize_trial_signup(pg_temp.u(12), pg_temp.h('ip1')) ->> 'allowed')$q$, 'OK=true');
-- envelhece só as autorizações de u12 e u13 (a de u11 precisa seguir válida para a concessão testada mais abaixo: a autorização expira em 1 h)
select pg_temp.chk('trial', 'janela expira: depois de 25 h o bloqueio da conexão cai para NOVOS cadastros', $q$with u as (update public.trial_signup_events set created_at = now() - interval '25 hours' where ip_hash = pg_temp.h('ip1') and outcome = 'allowed' and user_id <> pg_temp.u(11) returning 1) select (select count(*) from u)::text || ',' || (public.authorize_trial_signup(pg_temp.u(16), pg_temp.h('ip1')) ->> 'allowed')$q$, 'OK=2,true');
select pg_temp.chk('trial', 'quem foi negado continua negado (a decisão não é reavaliada sozinha)', $q$select (public.authorize_trial_signup(pg_temp.u(14), pg_temp.h('ip1')) ->> 'allowed')$q$, 'OK=false');
select pg_temp.chk('trial', 'identificador desconhecido (sem IP): autorizado e registrado como ip_unknown', $q$select (public.authorize_trial_signup(pg_temp.u(17), null) ->> 'reason') || ',' || pg_temp.ev_n(17, 'ip_unknown')$q$, 'OK=ip_unknown,1');
select pg_temp.chk('trial', 'hash curto demais é recusado', $q$select public.authorize_trial_signup(pg_temp.u(18), 'abc')::text$q$, 'ERR=Parâmetros inválidos');
select pg_temp.chk('trial', 'usuário inexistente é recusado', $q$select public.authorize_trial_signup(gen_random_uuid(), pg_temp.h('ip9'))::text$q$, 'ERR=Usuário não encontrado');
select pg_temp.chk('trial', 'retenção: eventos mais antigos que a retenção são apagados', $q$with ins as (insert into public.trial_signup_events(user_id, ip_hash, outcome, created_at) values (pg_temp.u(19), pg_temp.h('velho'), 'allowed', now() - interval '40 days') returning 1) select (select count(*) from ins)::text || ',' || (public.authorize_trial_signup(pg_temp.u(18), pg_temp.h('ip3')) ->> 'allowed') || ',' || pg_temp.ev_hash_n(pg_temp.h('velho'))::text$q$, 'OK=1,true,0');
select pg_temp.chk('trial', 'limite configurável: com limite 1, o 2º cadastro na conexão é negado', $q$with s as (insert into public.platform_settings(key, value, updated_at) values ('trial_signup_ip_limit', '1', now()) on conflict (key) do update set value = excluded.value returning 1) select (select count(*) from s)::text || ',' || (public.authorize_trial_signup(pg_temp.u(21), pg_temp.h('ip4')) ->> 'allowed') || ',' || (public.authorize_trial_signup(pg_temp.u(22), pg_temp.h('ip4')) ->> 'allowed')$q$, 'OK=1,true,false');
delete from public.platform_settings where key = 'trial_signup_ip_limit';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ul_u11","role":"authenticated"}', true);
select pg_temp.chk('trial', 'authenticated NÃO chama authorize_trial_signup (o cliente não forja o hash)', $q$select public.authorize_trial_signup(pg_temp.u(11), pg_temp.h('qualquer'))::text$q$, 'ERR=permission denied');
select pg_temp.chk('trial', 'authenticated NÃO lê os eventos antifraude', $q$select count(*)::text from public.trial_signup_events$q$, 'ERR=permission denied');
select pg_temp.chk('trial', 'authenticated NÃO insere evento antifraude', $q$insert into public.trial_signup_events(user_id, ip_hash, outcome) values (pg_temp.u(11), pg_temp.h('z'), 'allowed') returning 'x'$q$, 'ERR=permission denied');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('trial', 'anon NÃO chama authorize_trial_signup', $q$select public.authorize_trial_signup(pg_temp.u(11), pg_temp.h('qualquer'))::text$q$, 'ERR=permission denied');
set local role authenticated;

-- ---- concessão do teste grátis (create_company_with_owner)
select set_config('request.jwt.claims', '{"sub":"ul_u11","role":"authenticated"}', true);
select pg_temp.chk('grant', 'autorizado (T1) cria a empresa e RECEBE o teste grátis (trialing)', $q$select (public.create_company_with_owner('[ULTEST] T1', 'other')).name$q$, 'OK=[ULTEST] T1');
select pg_temp.chk('grant', 'T1: assinatura trialing com trial_claimed_by = ele', $q$select pg_temp.sub_of(11)$q$, 'OK=trialing,true');
select pg_temp.chk('grant', 'T1: o evento de autorização foi consumido (não vale para um segundo teste)', $q$select pg_temp.ev_consumed(11)::text$q$, 'OK=1');
select pg_temp.chk('grant', 'T1: criar outra empresa é recusado', $q$select (public.create_company_with_owner('[ULTEST] T1b', 'other')).name$q$, 'ERR=já pertence a uma empresa');
select set_config('request.jwt.claims', '{"sub":"ul_u30","role":"authenticated"}', true);
select pg_temp.chk('grant', 'CHAMADA DIRETA sem autorização: cria a empresa, mas NÃO ganha teste grátis', $q$select (public.create_company_with_owner('[ULTEST] direta', 'other')).name$q$, 'OK=[ULTEST] direta');
select pg_temp.chk('grant', 'sem autorização = sem assinatura', $q$select pg_temp.sub_of(30)$q$, 'OK=sem_assinatura');
select set_config('request.jwt.claims', '{"sub":"ul_u14","role":"authenticated"}', true);
select pg_temp.chk('grant', 'negado por IP (T4) cria empresa SEM teste', $q$select (public.create_company_with_owner('[ULTEST] T4', 'other')).name$q$, 'OK=[ULTEST] T4');
select pg_temp.chk('grant', 'negado por IP: sem assinatura', $q$select pg_temp.sub_of(14)$q$, 'OK=sem_assinatura');
select pg_temp.chk('grant', 'negado por IP: o app consegue informar o motivo (get_my_trial_status)', $q$select (public.get_my_trial_status())::text$q$, 'OK={"denied": true, "window_hours": 24}');
select set_config('request.jwt.claims', '{"sub":"ul_u11","role":"authenticated"}', true);
select pg_temp.chk('grant', 'quem recebeu o teste não aparece como negado', $q$select (public.get_my_trial_status() ->> 'denied')$q$, 'OK=false');
select set_config('request.jwt.claims', '{"sub":"ul_u17","role":"authenticated"}', true);
select pg_temp.chk('grant', 'conexão desconhecida (ip_unknown) também recebe o teste', $q$select (public.create_company_with_owner('[ULTEST] T7', 'other')).name || ',' || pg_temp.sub_of(17)$q$, 'OK=[ULTEST] T7,trialing,true');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('grant', 'reenvio: quem já usou o teste não recebe outro (trial_already_used) e nada novo é contado', $q$select (public.authorize_trial_signup(pg_temp.u(11), pg_temp.h('ip1')) ->> 'reason')$q$, 'OK=trial_already_used');
select pg_temp.chk('grant', 'um usuário só pode ter UMA assinatura de teste (índice/constraint do modelo)', $q$select count(*)::text from public.subscriptions where trial_claimed_by = pg_temp.u(11)$q$, 'OK=1');
select pg_temp.chk('grant', 'direitos preexistentes não foram alterados (assinaturas novas: T1 e T7 apenas)', $q$select ((select count(*) from public.subscriptions) - (select subs from base))::text || ',' || ((select count(*) from public.company_entitlements) - (select ents from base))::text$q$, 'OK=2,2');
select pg_temp.chk('grant', 'o teste concedido segue o plano FREE_TRIAL (duração do plano)', $q$select (extract(epoch from (s.expires_at - s.starts_at)) / 86400 between 0.99 and 1.01)::text from public.subscriptions s where s.trial_claimed_by = pg_temp.u(11)$q$, 'OK=true');
select pg_temp.chk('grant', 'entitlements do teste vêm do plano (0 usuários adicionais)', $q$select e.max_additional_users::text from public.company_entitlements e join public.subscriptions s on s.company_id = e.company_id where s.trial_claimed_by = pg_temp.u(11)$q$, 'OK=0');

do $result$
declare v jsonb;
begin
  select jsonb_build_object('total', count(*), 'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)) into v from r;
  raise exception 'RESULT: %', v::text;
end $result$;
