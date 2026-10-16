-- =============================================================================
-- Bateria SQL — Missão 09: gate de sessões (corrida/poda), autorização do teste grátis (prazo, conexão desconhecida,
-- pedido posterior), concessão única e ACESSO AOS DADOS no banco (políticas RESTRICTIVE). SOMENTE no projeto TEST.
-- Uma transação que termina em erro proposital (RESULT: ...): nada persiste.
-- Requer as migrations 20261014000000, ...000100, ...000200 e ...000300 aplicadas.
-- Concorrência REAL (vários backends): tests/integration/edge/usage-limits-concurrency-runner.ts.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status)
select ('eeeeeeee-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'm9_u' || g, 'M9 Usuário ' || g, 'm9-u' || g || '@example.invalid', 'user', 'active'
  from generate_series(1, 60) g;
-- 1 = dono A (sem assinatura) · 2 = dono B (teste ativo) · 3 = dono C (vencida) · 4 = dono D (vitalícia) · 5 = dono E (cancelada)
-- 6 = funcionário de B · 7 = pedido de teste (empresa sem assinatura) · 8 = sem empresa · 9 = funcionário de A
-- 10..12 = sessões · 13..15 = TTL · 16 = pedido com autorização vencida · 17..19 = reservas · 21..40 = enchimento (conexão desconhecida)

create temp table cos (k text primary key, id uuid);
insert into cos values ('a', gen_random_uuid()), ('b', gen_random_uuid()), ('c', gen_random_uuid()), ('d', gen_random_uuid()),
  ('e', gen_random_uuid()), ('g', gen_random_uuid()), ('h', gen_random_uuid());
insert into public.companies (id, name, business_type, status) select id, '[M9TEST] ' || k, 'other', 'active' from cos;
insert into public.company_members (company_id, user_id, role)
select c.id, ('eeeeeeee-0000-0000-0000-' || lpad(v.u::text, 12, '0'))::uuid, v.r::public.company_role
  from (values ('a', 1, 'owner'), ('b', 2, 'owner'), ('c', 3, 'owner'), ('d', 4, 'owner'), ('e', 5, 'owner'), ('g', 7, 'owner'), ('h', 16, 'owner')) v(k, u, r)
  join cos c on c.k = v.k;
insert into public.company_entitlements (company_id, status, max_additional_users) select id, 'active', 2 from cos where k in ('a', 'b');
insert into public.company_members (company_id, user_id, role) values
  ((select id from cos where k = 'b'), 'eeeeeeee-0000-0000-0000-000000000006', 'employee'),
  ((select id from cos where k = 'a'), 'eeeeeeee-0000-0000-0000-000000000009', 'employee');
-- assinaturas: B ativa (teste), C vencida, D vitalícia, E cancelada; A, G e H sem assinatura
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, lifetime)
select c.id, (select id from public.plans where code = 'MONTHLY'), v.st::public.subscription_status, now() - interval '40 days',
       case v.k when 'b' then now() + interval '10 days' when 'c' then now() - interval '2 days' when 'd' then null else now() + interval '10 days' end,
       v.k = 'd'
  from (values ('b', 'active'), ('c', 'active'), ('d', 'active'), ('e', 'cancelled')) v(k, st) join cos c on c.k = v.k;

create temp table r (n serial, grp text, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
grant all on cos to authenticated, anon;
create or replace function pg_temp.co(k text) returns uuid language sql as $$ select id from cos where cos.k = $1 $$;
grant execute on function pg_temp.co(text) to authenticated, anon;
create or replace function pg_temp.u(i integer) returns uuid language sql as $$ select ('eeeeeeee-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid $$;
grant execute on function pg_temp.u(integer) to authenticated, anon;
create or replace function pg_temp.h(s text) returns text language sql as $$ select md5($1) || md5($1 || 'm9') $$;
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
  insert into r(grp, label, expect, got, ok) values (g, l, e, left(got, 240), pass);
end $$;
grant execute on function pg_temp.chk(text, text, text, text) to authenticated, anon;
-- leituras sem RLS (volúteis: enxergam o que acabou de mudar)
create or replace function pg_temp.slot_n(p_sid text) returns integer language sql security definer as $$
  select count(*)::integer from public.user_session_slots where session_id = p_sid $$;
grant execute on function pg_temp.slot_n(text) to authenticated, anon;
create or replace function pg_temp.sub_of(p_user integer) returns text language sql security definer as $$
  select coalesce((select s.status::text || ',' || (s.trial_claimed_by = pg_temp.u(p_user))::text
                     from public.subscriptions s join public.company_members m on m.company_id = s.company_id
                    where m.user_id = pg_temp.u(p_user) and m.role = 'owner'), 'sem_assinatura') $$;
grant execute on function pg_temp.sub_of(integer) to authenticated, anon;
create or replace function pg_temp.ev_n(p_user integer, p_outcome text) returns integer language sql security definer as $$
  select count(*)::integer from public.trial_signup_events where user_id = pg_temp.u(p_user) and outcome = p_outcome $$;
grant execute on function pg_temp.ev_n(integer, text) to authenticated, anon;
create or replace function pg_temp.cust_n(p_co text) returns integer language sql security definer as $$
  select count(*)::integer from public.customers where company_id = pg_temp.co(p_co) $$;
grant execute on function pg_temp.cust_n(text) to authenticated, anon;
-- sonda: tenta inserir uma linha mínima em cada tabela protegida. Devolve 'recusadas pela política de acesso / tabelas / inseridas'
-- (a política RESTRICTIVE é identificada pelo NOME na mensagem de erro: só aparece quando o resto da linha é válido)
create or replace function pg_temp.gate_probe(p_company uuid) returns text language plpgsql as $$
declare t text; denied integer := 0; total integer := 0; ok integer := 0; msg text; me uuid := public.current_profile_user_id(); sale uuid;
begin
  for t in select distinct tablename from pg_policies where schemaname = 'public' and policyname ~ '_require_access_ins$' order by 1 loop
    total := total + 1;
    begin
      if t = 'sales' then
        insert into public.sales (company_id, user_id) values (p_company, me);
      elsif t = 'customer_raffles' then
        insert into public.customer_raffles (company_id, participant_count, winner_count, executed_by) values (p_company, 0, 0, me);
      elsif t = 'sale_items' then
        select id into sale from public.sales where company_id = p_company and status = 'draft' limit 1;
        insert into public.sale_items (company_id, sale_id, item_type, description, quantity, unit_price, subtotal, total_amount) values (p_company, sale, 'service', 'x', 1, 0, 0, 0);
      else
        execute format('insert into public.%I (company_id) values (%L)', t, p_company);
      end if;
      ok := ok + 1;
    exception when others then
      msg := sqlerrm;
      if msg like '%_require_access_ins%' then denied := denied + 1; end if;
    end;
  end loop;
  return denied || '/' || total || '/' || ok;
end $$;
grant execute on function pg_temp.gate_probe(uuid) to authenticated, anon;
create or replace function pg_temp.gp(p_company uuid, p_part integer) returns text language sql as $$ select split_part(pg_temp.gate_probe($1), '/', $2) $$;
grant execute on function pg_temp.gp(uuid, integer) to authenticated, anon;
-- helpers volúteis (um subselect/função STABLE no MESMO comando enxerga o snapshot antigo)
create or replace function pg_temp.ta(p_user integer) returns boolean language sql security definer as $$ select public.has_trial_authorization(pg_temp.u($1)) $$;
grant execute on function pg_temp.ta(integer) to authenticated, anon;
create or replace function pg_temp.audit_n(p_action text, p_user integer, p_ref text) returns integer language sql security definer as $$
  select count(*)::integer from public.audit_logs where action = $1 and target_user_id = pg_temp.u($2) and metadata ->> 'ip_ref' = $3 $$;
grant execute on function pg_temp.audit_n(text, integer, text) to authenticated, anon;

-- ================================================================ ACESSO AOS DADOS (banco)
select pg_temp.chk('policy', '18 tabelas, 40 políticas RESTRICTIVE de acesso (INSERT/UPDATE/DELETE) para authenticated', $q$select count(distinct tablename)::text || '/' || count(*)::text || '/' || count(*) filter (where permissive = 'RESTRICTIVE' and roles = '{authenticated}')::text from pg_policies where schemaname = 'public' and policyname like '%\_require\_access\_%'$q$, 'OK=18/40/40');
select pg_temp.chk('policy', 'nenhuma política de SELECT foi restringida (vencidos continuam lendo os próprios dados)', $q$select count(*)::text from pg_policies where schemaname = 'public' and policyname like '%\_require\_access\_%' and cmd = 'SELECT'$q$, 'OK=0');
select pg_temp.chk('policy', 'company_has_active_access: anon não executa', $q$select count(*)::text from information_schema.routine_privileges where routine_schema = 'public' and routine_name = 'company_has_active_access' and grantee = 'anon'$q$, 'OK=0');

insert into public.customers (company_id, name) select id, 'cliente semente' from cos where k in ('a', 'b', 'c', 'd', 'e');
insert into public.sales (company_id, user_id) select c.id, m.user_id from cos c join public.company_members m on m.company_id = c.id and m.role = 'owner' where c.k in ('a', 'b', 'c', 'd', 'e');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"m9_u1","role":"authenticated"}', true);
select pg_temp.chk('access', 'A (SEM assinatura / teste negado): INSERT direto em customers é RECUSADO', $q$insert into public.customers(company_id, name) values (pg_temp.co('a'), 'x') returning 'ok'$q$, 'ERR=customers_require_access_ins');
select pg_temp.chk('access', 'A: INSERT direto em product_categories é RECUSADO', $q$insert into public.product_categories(company_id, name) values (pg_temp.co('a'), 'x') returning 'ok'$q$, 'ERR=product_categories_require_access_ins');
select pg_temp.chk('access', 'A: sonda em TODAS as 18 tabelas — todas recusadas pela política de acesso', $q$select pg_temp.gate_probe(pg_temp.co('a'))$q$, 'OK=18/18/0');
select pg_temp.chk('access', 'A: UPDATE/DELETE de dado existente: 0 linhas', $q$with u as (update public.customers set name = 'z' where company_id = pg_temp.co('a') returning 1), d as (delete from public.customers where company_id = pg_temp.co('a') returning 1) select (select count(*) from u)::text || ',' || (select count(*) from d)::text$q$, 'OK=0,0');
select pg_temp.chk('access', 'A: a leitura continua funcionando (SELECT não foi restringido)', $q$select count(*)::text from public.customers where company_id = pg_temp.co('a')$q$, 'OK=1');
select set_config('request.jwt.claims', '{"sub":"m9_u2","role":"authenticated"}', true);
select pg_temp.chk('access', 'B (assinatura ativa): nenhuma recusa pela política de acesso, e há escritas que passam', $q$select (pg_temp.gp(pg_temp.co('b'), 1) = '0')::text || ',' || (pg_temp.gp(pg_temp.co('b'), 3)::integer >= 2)::text$q$, 'OK=true,true');
select pg_temp.chk('access', 'B: insere cliente normalmente', $q$insert into public.customers(company_id, name) values (pg_temp.co('b'), 'x') returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('access', 'B: UPDATE do próprio dado funciona', $q$with u as (update public.customers set name = 'z' where company_id = pg_temp.co('b') and name = 'x' returning 1) select count(*)::text from u$q$, 'OK=1');
select pg_temp.chk('access', 'B: DELETE do próprio dado funciona', $q$with d as (delete from public.customers where company_id = pg_temp.co('b') and name = 'z' returning 1) select count(*)::text from d$q$, 'OK=1');
select pg_temp.chk('access', 'B continua sem acesso à empresa A (isolamento por associação)', $q$insert into public.customers(company_id, name) values (pg_temp.co('a'), 'x') returning 'ok'$q$, 'ERR=row-level security');
select set_config('request.jwt.claims', '{"sub":"m9_u3","role":"authenticated"}', true);
select pg_temp.chk('access', 'C (assinatura VENCIDA): escrita recusada em todas as tabelas', $q$select pg_temp.gate_probe(pg_temp.co('c'))$q$, 'OK=18/18/0');
select pg_temp.chk('access', 'C: lê (e pode exportar) os próprios dados', $q$select count(*)::text from public.customers where company_id = pg_temp.co('c')$q$, 'OK=1');
select pg_temp.chk('access', 'C: UPDATE do dado existente afeta 0 linhas', $q$with u as (update public.customers set name = 'z' where company_id = pg_temp.co('c') returning 1) select count(*)::text from u$q$, 'OK=0');
select set_config('request.jwt.claims', '{"sub":"m9_u4","role":"authenticated"}', true);
select pg_temp.chk('access', 'D (acesso VITALÍCIO): escrita liberada', $q$select pg_temp.gp(pg_temp.co('d'), 1)$q$, 'OK=0');
select set_config('request.jwt.claims', '{"sub":"m9_u5","role":"authenticated"}', true);
select pg_temp.chk('access', 'E (assinatura CANCELADA): escrita recusada', $q$select pg_temp.gate_probe(pg_temp.co('e'))$q$, 'OK=18/18/0');
select set_config('request.jwt.claims', '{"sub":"m9_u6","role":"authenticated"}', true);
select pg_temp.chk('access', 'funcionário de B (empresa com acesso): nenhuma recusa pela política de acesso', $q$select pg_temp.gp(pg_temp.co('b'), 1)$q$, 'OK=0');
select set_config('request.jwt.claims', '{"sub":"m9_u9","role":"authenticated"}', true);
select pg_temp.chk('access', 'funcionário de A (empresa SEM acesso) também não escreve nada', $q$select pg_temp.gp(pg_temp.co('a'), 3)$q$, 'OK=0');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('access', 'service_role (webhooks/RPCs de plataforma) não passa por RLS: grava em empresa sem acesso', $q$insert into public.customers(company_id, name) values (pg_temp.co('a'), 'via servidor') returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('access', 'ao conceder acesso a A (assinatura ativa), a escrita é liberada na hora', $q$with s as (insert into public.subscriptions(company_id, plan_id, status, starts_at, expires_at) values (pg_temp.co('a'), (select id from public.plans where code = 'MONTHLY'), 'active', now(), now() + interval '31 days') returning 1) select count(*)::text from s$q$, 'OK=1');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"m9_u1","role":"authenticated"}', true);
select pg_temp.chk('access', 'A após receber acesso: sonda sem recusas', $q$select pg_temp.gp(pg_temp.co('a'), 1)$q$, 'OK=0');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
delete from public.subscriptions where company_id = (select id from cos where k = 'a');

-- ================================================================ SESSÕES: corrida entre a lista do Clerk e o registro
select pg_temp.chk('session_race', 'assinatura antiga (3 argumentos) continua funcionando', $q$select (public.register_session_slot(pg_temp.u(10), 'm9_s1', array['m9_s1']) ->> 'state')$q$, 'OK=allowed');
select pg_temp.chk('session_race', 'sessão aceita agora há pouco NÃO é podada por uma lista lida antes dela (corrida)', $q$select (public.register_session_slot(pg_temp.u(10), 'm9_s2', array['m9_s2']) ->> 'state') || ',' || pg_temp.slot_n('m9_s1')$q$, 'OK=allowed,1');
select pg_temp.chk('session_race', 'vaga ocupada por sessão que o Clerk já não lista só é liberada depois de 60 s', $q$with a as (update public.user_session_slots set verified_at = now() - interval '2 minutes' where session_id = 'm9_s1' returning 1) select (select count(*) from a)::text || ',' || (public.register_session_slot(pg_temp.u(10), 'm9_s2', array['m9_s2']) ->> 'state') || ',' || pg_temp.slot_n('m9_s1')$q$, 'OK=1,allowed,0');
select pg_temp.chk('session_race', 'lista INCOMPLETA (paginação/limite): nada é podado', $q$with a as (update public.user_session_slots set verified_at = now() - interval '2 minutes' where session_id = 'm9_s2' returning 1) select (select count(*) from a)::text || ',' || (public.register_session_slot(pg_temp.u(10), 'm9_s3', array['m9_s3'], false) ->> 'state') || ',' || pg_temp.slot_n('m9_s2')$q$, 'OK=1,allowed,1');
select pg_temp.chk('session_race', 'com lista incompleta o limite continua valendo (contagem só de vagas aceitas)', $q$select (public.register_session_slot(pg_temp.u(10), 'm9_s4', array['m9_s4'], false) ->> 'state') || ',' || (public.register_session_slot(pg_temp.u(10), 'm9_s5', array['m9_s5'], false) ->> 'state')$q$, 'OK=allowed,blocked');
select pg_temp.chk('session_race', 'sessão fora da lista é "invalid" mesmo com a lista incompleta (nunca ocupa vaga)', $q$select (public.register_session_slot(pg_temp.u(10), 'm9_fantasma', array['outra'], false) ->> 'state') || ',' || pg_temp.slot_n('m9_fantasma')$q$, 'OK=invalid,0');
select pg_temp.chk('session_race', 'nova assinatura exige service_role', $q$select count(*)::text from information_schema.routine_privileges where routine_schema = 'public' and routine_name = 'register_session_slot' and grantee in ('anon', 'authenticated', 'PUBLIC')$q$, 'OK=0');

-- ================================================================ TESTE GRÁTIS: prazo da autorização
select pg_temp.chk('ttl', 'autorização nova é válida', $q$select ((public.authorize_trial_signup(pg_temp.u(13), pg_temp.h('m9ip1')) ->> 'allowed') || ',' || pg_temp.ta(13)::text)$q$, 'OK=true,true');
select pg_temp.chk('ttl', 'depois do prazo (2 h) a autorização NÃO vale mais', $q$with a as (update public.trial_signup_events set created_at = now() - interval '2 hours' where user_id = pg_temp.u(13) returning 1) select (select count(*) from a)::text || ',' || pg_temp.ta(13)::text$q$, 'OK=1,false');
select pg_temp.chk('ttl', 'autorização vencida e NÃO consumida: reavaliada (novo evento), sem replay', $q$select (public.authorize_trial_signup(pg_temp.u(13), pg_temp.h('m9ip1')) ->> 'replayed') is null and pg_temp.ev_n(13, 'allowed') = 2$q$, 'OK=true');
update public.trial_signup_events set created_at = now() - interval '3 hours' where user_id = pg_temp.u(13);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"m9_u13","role":"authenticated"}', true);
select pg_temp.chk('ttl', 'u13 cria empresa com autorização vencida: empresa criada, SEM teste', $q$select (public.create_company_with_owner('[M9TEST] ttl', 'other')).name || ',' || pg_temp.sub_of(13)$q$, 'OK=[M9TEST] ttl,sem_assinatura');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('ttl', 'conexão m9ip2: 3 cadastros autorizados', $q$select (public.authorize_trial_signup(pg_temp.u(21), pg_temp.h('m9ip2')) ->> 'allowed') || ',' || (public.authorize_trial_signup(pg_temp.u(22), pg_temp.h('m9ip2')) ->> 'allowed') || ',' || (public.authorize_trial_signup(pg_temp.u(23), pg_temp.h('m9ip2')) ->> 'allowed')$q$, 'OK=true,true,true');
select pg_temp.chk('ttl', 'negado por IP: dentro do prazo a negativa é repetida (replay)', $q$select (public.authorize_trial_signup(pg_temp.u(24), pg_temp.h('m9ip2')) ->> 'allowed') || ',' || (public.authorize_trial_signup(pg_temp.u(24), pg_temp.h('m9ip2')) ->> 'replayed')$q$, 'OK=false,true');
select pg_temp.chk('ttl', 'janela e prazo vencidos: o mesmo usuário negado é liberado no novo pedido', $q$with a as (update public.trial_signup_events set created_at = now() - interval '30 hours' where ip_hash = pg_temp.h('m9ip2') returning 1) select (select count(*) from a)::text || ',' || (public.authorize_trial_signup(pg_temp.u(24), pg_temp.h('m9ip2')) ->> 'allowed')$q$, 'OK=4,true');

-- conexão desconhecida: teto próprio (10x o limite) em vez de "livre"
insert into public.platform_settings(key, value, updated_at) values ('trial_signup_ip_limit', '1', now()) on conflict (key) do update set value = excluded.value;
select pg_temp.chk('unknown_ip', 'com limite 1, as 10 primeiras conexões desconhecidas são aceitas (registradas)', $q$select count(*) filter (where (public.authorize_trial_signup(pg_temp.u(i), null) ->> 'allowed') = 'true')::text from generate_series(25, 34) i$q$, 'OK=10');
select pg_temp.chk('unknown_ip', 'a 11ª conexão desconhecida é NEGADA (teto 10x), com auditoria sem IP', $q$select (public.authorize_trial_signup(pg_temp.u(35), null) ->> 'allowed') || ',' || pg_temp.audit_n('platform.signup.trial_denied', 35, 'unknown')::text$q$, 'OK=false,1');
select pg_temp.chk('unknown_ip', 'a conexão identificável não é afetada pelo teto das desconhecidas', $q$select (public.authorize_trial_signup(pg_temp.u(36), pg_temp.h('m9ip3')) ->> 'allowed')$q$, 'OK=true');
delete from public.platform_settings where key = 'trial_signup_ip_limit';

-- ================================================================ PEDIDO POSTERIOR DO TESTE (claim_free_trial)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"m9_u7","role":"authenticated"}', true);
select pg_temp.chk('claim', 'empresa sem assinatura e SEM autorização do servidor: nada é concedido', $q$select public.claim_free_trial() ->> 'reason'$q$, 'OK=not_authorized');
select pg_temp.chk('claim', 'continua sem assinatura', $q$select pg_temp.sub_of(7)$q$, 'OK=sem_assinatura');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('claim', 'servidor autoriza (conexão livre)', $q$select (public.authorize_trial_signup(pg_temp.u(7), pg_temp.h('m9ip4')) ->> 'allowed')$q$, 'OK=true');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"m9_u7","role":"authenticated"}', true);
select pg_temp.chk('claim', 'com autorização válida, o pedido concede o teste à empresa existente', $q$select public.claim_free_trial()::text$q$, 'OK={"reason": "ok", "granted": true}');
select pg_temp.chk('claim', 'assinatura de teste criada para o dono', $q$select pg_temp.sub_of(7)$q$, 'OK=trialing,true');
select pg_temp.chk('claim', 'repetir o pedido NÃO concede de novo (idempotente)', $q$select public.claim_free_trial() ->> 'reason'$q$, 'OK=already_used');
select pg_temp.chk('claim', 'a empresa do teste passa a ter acesso ativo no banco', $q$select public.company_has_active_access(pg_temp.co('g'))::text$q$, 'OK=true');
select set_config('request.jwt.claims', '{"sub":"m9_u8","role":"authenticated"}', true);
select pg_temp.chk('claim', 'usuário sem empresa: no_company', $q$select public.claim_free_trial() ->> 'reason'$q$, 'OK=no_company');
select set_config('request.jwt.claims', '{"sub":"m9_u6","role":"authenticated"}', true);
select pg_temp.chk('claim', 'funcionário (não dono) não pede teste para a empresa', $q$select public.claim_free_trial() ->> 'reason'$q$, 'OK=no_company');
select set_config('request.jwt.claims', '{"sub":"m9_u3","role":"authenticated"}', true);
select pg_temp.chk('claim', 'empresa que já tem assinatura (vencida) não recebe teste', $q$select public.claim_free_trial() ->> 'reason'$q$, 'OK=has_subscription');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select pg_temp.chk('claim', 'sem identidade no token: recusado', $q$select public.claim_free_trial()::text$q$, 'ERR=não autenticado');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('claim', 'anon não chama claim_free_trial', $q$select public.claim_free_trial()::text$q$, 'ERR=permission denied');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"m9_u7","role":"authenticated"}', true);
select pg_temp.chk('claim', 'authenticated NÃO chama a função interna de concessão', $q$select public.grant_free_trial_internal(pg_temp.u(7), pg_temp.co('g'))::text$q$, 'ERR=permission denied');
select pg_temp.chk('claim', 'nem has_trial_authorization (não sonda autorização alheia)', $q$select public.has_trial_authorization(pg_temp.u(7))::text$q$, 'ERR=permission denied');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('claim', 'service_role também não executa a concessão direta (só via RPCs)', $q$select has_function_privilege('service_role', 'public.grant_free_trial_internal(uuid,uuid)', 'execute')::text$q$, 'OK=false');
select pg_temp.chk('claim', 'concessão duplicada por INSERT direto é barrada pelo índice único já existente (um teste por usuário)', $q$insert into public.subscriptions(company_id, plan_id, status, starts_at, expires_at, trial_claimed_by) values (pg_temp.co('h'), (select id from public.plans where code = 'FREE_TRIAL'), 'trialing', now(), now() + interval '1 day', pg_temp.u(7)) returning 'x'$q$, 'ERR=subscriptions_one_trial_per_user_idx');
select pg_temp.chk('claim', 'autorização consumida pela concessão: não vale para outro teste', $q$select pg_temp.ta(7)::text$q$, 'OK=false');

-- ================================================================ CONCESSÃO NA CRIAÇÃO DA EMPRESA (contração aplicada)
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('create', 'u17 autorizado cria empresa e recebe o teste uma única vez', $q$select (public.authorize_trial_signup(pg_temp.u(17), pg_temp.h('m9ip5')) ->> 'allowed')$q$, 'OK=true');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"m9_u17","role":"authenticated"}', true);
select pg_temp.chk('create', 'cria a empresa', $q$select (public.create_company_with_owner('[M9TEST] u17', 'other')).name || ',' || pg_temp.sub_of(17)$q$, 'OK=[M9TEST] u17,trialing,true');
select pg_temp.chk('create', 'escreve dados dentro do teste ativo (o gate de acesso aceita o teste)', $q$insert into public.customers(company_id, name) select company_id, 'primeiro cliente' from public.company_members where user_id = pg_temp.u(17) returning 'ok'$q$, 'OK=ok');
select set_config('request.jwt.claims', '{"sub":"m9_u18","role":"authenticated"}', true);
select pg_temp.chk('create', 'u18 SEM autorização cria empresa sem teste e NÃO escreve dados (acesso fechado no banco)', $q$select (public.create_company_with_owner('[M9TEST] u18', 'other')).name || ',' || pg_temp.sub_of(18)$q$, 'OK=[M9TEST] u18,sem_assinatura');
select pg_temp.chk('create', 'u18: nada é gravado e 17 das 18 tabelas recusam pela política (sale_items precisa de uma venda em rascunho, que ele também não consegue criar)', $q$select pg_temp.gp((select company_id from public.company_members where user_id = pg_temp.u(18)), 3) || ',' || (pg_temp.gp((select company_id from public.company_members where user_id = pg_temp.u(18)), 1)::integer >= 17)::text$q$, 'OK=0,true');
select pg_temp.chk('create', 'u18: o seed de categorias financeiras da criação da empresa NÃO foi afetado pelo gate', $q$select (count(*) > 0)::text from public.financial_categories where company_id = (select company_id from public.company_members where user_id = pg_temp.u(18))$q$, 'OK=true');

do $result$
declare v jsonb;
begin
  select jsonb_build_object('total', count(*), 'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)) into v from r;
  raise exception 'RESULT: %', v::text;
end $result$;
