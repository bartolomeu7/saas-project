-- =============================================================================
-- Bateria SQL — gestão de planos, preços, descontos, benefícios e RBAC. Roda SOMENTE no projeto TEST.
-- Uma transação que termina em erro proposital (RESULT: ...): nada persiste.
-- Requer 20261014000000_plans_management_and_usage_limits.sql aplicada.
-- O JWT do Clerk é simulado por `request.jwt.claims` (sub) + role authenticated.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

update public.profiles set clerk_user_id = 'pm_super' where user_id = '2068cbe0-ade1-41f6-8301-ddbe2cfcb1fb';
update public.profiles set clerk_user_id = 'pm_admin' where user_id = '5280eb70-5ca1-47f2-b154-9a47dbe0b021';
update public.profiles set clerk_user_id = 'pm_user'  where user_id = 'dc959a48-4136-496e-bbf9-fba7cebed805';
select set_config('app.platform_profile_write', 'on', true);
update public.profiles set role = 'admin' where user_id = '5280eb70-5ca1-47f2-b154-9a47dbe0b021';
select set_config('app.platform_profile_write', 'off', true);

create temp table base as select (select count(*) from public.subscriptions) subs, (select count(*) from public.subscription_payments) pays,
  (select count(*) from public.company_entitlements) ents, (select sum(amount) from public.subscription_payments) pay_sum,
  (select count(*) from public.plans) plans, (select md5(string_agg(code || ':' || coalesce(price::text, '-'), ',' order by code)) from public.plans) price_md5;
create temp table pids (k text primary key, id uuid);
create temp table cnt (v integer);
create temp table co (id uuid);
create temp table r (n serial, grp text, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
grant all on pids to authenticated, anon;
grant all on cnt to authenticated, anon;
grant all on co to authenticated, anon;

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
create or replace function pg_temp.pid(k text) returns uuid language sql security definer as $$ select id from pids where pids.k = $1 $$;
grant execute on function pg_temp.pid(text) to authenticated, anon;
-- campo do catálogo PÚBLICO (get_public_plans) para um código
create or replace function pg_temp.pub(p_code text, p_field text) returns text language sql security definer as $$
  select coalesce((to_jsonb(g) ->> p_field), 'null') from public.get_public_plans() g where g.code = p_code $$;
grant execute on function pg_temp.pub(text, text) to authenticated, anon;
create or replace function pg_temp.pub_count(p_code text) returns integer language sql security definer as $$
  select count(*)::integer from public.get_public_plans() g where g.code = p_code $$;
grant execute on function pg_temp.pub_count(text) to authenticated, anon;
create or replace function pg_temp.col(p_code text, p_col text) returns text language sql security definer as $$
  select coalesce((to_jsonb(p) ->> p_col), 'null') from public.plans p where p.code = p_code $$;
grant execute on function pg_temp.col(text, text) to authenticated, anon;
create or replace function pg_temp.bid(p_code text, p_text text) returns uuid language sql security definer as $$
  select b.id from public.plan_benefits b join public.plans p on p.id = b.plan_id where p.code = p_code and b.text = p_text and b.archived_at is null $$;
grant execute on function pg_temp.bid(text, text) to authenticated, anon;
create or replace function pg_temp.bcount(p_code text, p_filter text) returns integer language sql security definer as $$
  select count(*)::integer from public.plan_benefits b join public.plans p on p.id = b.plan_id
   where p.code = p_code and case p_filter when 'all' then true when 'archived' then b.archived_at is not null else b.archived_at is null end $$;
grant execute on function pg_temp.bcount(text, text) to authenticated, anon;
create or replace function pg_temp.audits(p_code text, p_action text) returns integer language sql security definer as $$
  select count(*)::integer from public.audit_logs a join public.plans p on p.id = a.entity_id where a.entity_type = 'plan' and p.code = p_code and a.action = p_action $$;
grant execute on function pg_temp.audits(text, text) to authenticated, anon;

-- ================================================================ RBAC
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"pm_user","role":"authenticated"}', true);
select pg_temp.chk('rbac', 'usuário comum NÃO cria plano', $q$select public.admin_save_plan(null, '{"code":"PM_X","name":"X","price":10,"access_duration_days":30}'::jsonb)::text$q$, 'ERR=not authorized');
select pg_temp.chk('rbac', 'usuário comum NÃO edita plano', $q$select public.admin_save_plan((select id from public.plans where code = 'MONTHLY'), '{"price":1}'::jsonb)::text$q$, 'ERR=not authorized');
select pg_temp.chk('rbac', 'usuário comum NÃO lista o catálogo administrativo', $q$select count(*)::text from public.list_platform_plans()$q$, 'ERR=not authorized');
select pg_temp.chk('rbac', 'usuário comum NÃO lê o histórico de plano', $q$select count(*)::text from public.list_platform_plan_history((select id from public.plans where code = 'MONTHLY'))$q$, 'ERR=not authorized');
select pg_temp.chk('rbac', 'usuário comum NÃO altera plano por UPDATE direto (RLS)', $q$with u as (update public.plans set price = 1 returning 1) select count(*)::text from u$q$, 'OK=0');
select pg_temp.chk('rbac', 'usuário comum NÃO insere plano direto', $q$insert into public.plans(code, name) values ('HACK', 'Hack') returning 'x'$q$, 'ERR=');
select pg_temp.chk('rbac', 'usuário comum NÃO lê plan_benefits (sem privilégio de tabela)', $q$select count(*)::text from public.plan_benefits$q$, 'ERR=permission denied');
select pg_temp.chk('rbac', 'usuário comum NÃO escreve plan_benefits', $q$insert into public.plan_benefits(plan_id, text) values ((select id from public.plans limit 1), 'x') returning 'x'$q$, 'ERR=permission denied');
select pg_temp.chk('rbac', 'usuário comum NÃO muda configurações', $q$select public.set_platform_setting('max_concurrent_sessions', 20, 'x')::text$q$, 'ERR=not authorized');

select set_config('request.jwt.claims', '{"sub":"pm_admin","role":"authenticated"}', true);
select pg_temp.chk('rbac', 'admin (não super) NÃO cria plano', $q$select public.admin_save_plan(null, '{"code":"PM_X","name":"X","price":10,"access_duration_days":30}'::jsonb)::text$q$, 'ERR=not authorized');
select pg_temp.chk('rbac', 'admin (não super) NÃO edita preço', $q$select public.admin_save_plan((select id from public.plans where code = 'MONTHLY'), '{"price":1}'::jsonb)::text$q$, 'ERR=not authorized');
select pg_temp.chk('rbac', 'admin lê o catálogo administrativo (>= 5 planos)', $q$select (count(*) >= 5)::text from public.list_platform_plans()$q$, 'OK=true');
select pg_temp.chk('rbac', 'admin lê o histórico, SEM e-mail do ator', $q$select count(*)::text from public.list_platform_plan_history((select id from public.plans where code = 'MONTHLY')) where actor_email is not null$q$, 'OK=0');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('rbac', 'anon NÃO executa admin_save_plan', $q$select public.admin_save_plan(null, '{}'::jsonb)::text$q$, 'ERR=permission denied');
select pg_temp.chk('rbac', 'anon NÃO executa list_platform_plans', $q$select count(*)::text from public.list_platform_plans()$q$, 'ERR=permission denied');
select pg_temp.chk('rbac', 'anon NÃO lê a tabela plans', $q$select count(*)::text from public.plans$q$, 'ERR=permission denied');
select pg_temp.chk('rbac', 'anon lê o catálogo público', $q$select (count(*) >= 4)::text from public.get_public_plans()$q$, 'OK=true');
select pg_temp.chk('rbac', 'catálogo público NÃO expõe provider, lifetime nem campos internos', $q$select (not (to_jsonb(g) ? 'provider') and not (to_jsonb(g) ? 'provider_plan_id') and not (to_jsonb(g) ? 'public_visible') and not (to_jsonb(g) ? 'promo_enabled') and not (to_jsonb(g) ? 'created_at'))::text from (select * from public.get_public_plans() limit 1) g$q$, 'OK=true');

-- ================================================================ CRIAR (super_admin)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"pm_super","role":"authenticated"}', true);
select pg_temp.chk('create', 'super cria plano válido com promoção e benefícios', $q$insert into pids select 'a', public.admin_save_plan(null, jsonb_build_object(
  'code','PM_A','name','Plano PM A','description','Descrição A','price',65,'access_duration_days',31,'billing_interval','month',
  'additional_user_limit',5,'sort_order',55,'tagline','Oferta','highlight','popular','cta_label','Assinar PM A',
  'compare_price',89.90,'promo_enabled',true,'promo_ends_at',(now() + interval '10 days'),
  'benefits', jsonb_build_array(jsonb_build_object('text','B1','highlighted',true), jsonb_build_object('text','B2'),
                                jsonb_build_object('text','B3','visible',false)))) returning 'criado'$q$, 'OK=criado');
select pg_temp.chk('create', 'campos persistidos (nome, preço, limite, ordem)', $q$select pg_temp.col('PM_A','name') || '|' || pg_temp.col('PM_A','price') || '|' || pg_temp.col('PM_A','additional_user_limit') || '|' || pg_temp.col('PM_A','sort_order') || '|' || pg_temp.col('PM_A','status')$q$, 'OK=Plano PM A|65.00|5|55|active');
select pg_temp.chk('create', '3 benefícios gravados (1 oculto)', $q$select pg_temp.bcount('PM_A', 'active')::text$q$, 'OK=3');
select pg_temp.chk('create', 'público: preço atual', $q$select pg_temp.pub('PM_A','price')$q$, 'OK=65.00');
select pg_temp.chk('create', 'público: preço anterior', $q$select pg_temp.pub('PM_A','compare_price')$q$, 'OK=89.90');
select pg_temp.chk('create', 'público: desconto = 27,7 % (exemplo 89,90 -> 65,00)', $q$select pg_temp.pub('PM_A','discount_percent')$q$, 'OK=27.7');
select pg_temp.chk('create', 'público: economia = R$ 24,90', $q$select pg_temp.pub('PM_A','savings_amount')$q$, 'OK=24.90');
select pg_temp.chk('create', 'público: só os 2 benefícios visíveis (oculto não aparece)', $q$select pg_temp.pub('PM_A','benefits')::jsonb::text$q$, 'OK=[{"text": "B1", "included": true, "highlighted": true}, {"text": "B2", "included": true, "highlighted": false}]');
select pg_temp.chk('create', 'público: tagline, destaque e botão', $q$select pg_temp.pub('PM_A','tagline') || '|' || pg_temp.pub('PM_A','highlight') || '|' || pg_temp.pub('PM_A','cta_label')$q$, 'OK=Oferta|popular|Assinar PM A');
select pg_temp.chk('create', 'auditoria da criação (plan.created + plan.details_updated)', $q$select pg_temp.audits('PM_A','platform.plan.created') || ',' || pg_temp.audits('PM_A','platform.plan.details_updated')$q$, 'OK=1,1');
select pg_temp.chk('create', 'código duplicado', $q$select public.admin_save_plan(null, '{"code":"PM_A","name":"Dup","price":10,"access_duration_days":30}'::jsonb)::text$q$, 'ERR=Já existe um plano');
select pg_temp.chk('create', 'código inválido', $q$select public.admin_save_plan(null, '{"code":"1bad","name":"X","price":10,"access_duration_days":30}'::jsonb)::text$q$, 'ERR=Código inválido');
select pg_temp.chk('create', 'nome vazio', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"  ","price":10,"access_duration_days":30}'::jsonb)::text$q$, 'ERR=Nome do plano inválido');
select pg_temp.chk('create', 'preço negativo', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":-5,"access_duration_days":30}'::jsonb)::text$q$, 'ERR=Preço inválido');
select pg_temp.chk('create', 'preço acima do máximo', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":100001,"access_duration_days":30}'::jsonb)::text$q$, 'ERR=Preço inválido');
select pg_temp.chk('create', 'plano pago abaixo de R$ 1,00 (mínimo do provedor)', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":0.5,"access_duration_days":30}'::jsonb)::text$q$, 'ERR=preço mínimo');
select pg_temp.chk('create', 'plano pago sem preço', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","access_duration_days":30}'::jsonb)::text$q$, 'ERR=preço mínimo');
select pg_temp.chk('create', 'duração obrigatória em plano comum', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":10}'::jsonb)::text$q$, 'ERR=Duração de acesso obrigatória');
select pg_temp.chk('create', 'duração absurda', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":10,"access_duration_days":99999}'::jsonb)::text$q$, 'ERR=Duração de acesso inválida');
select pg_temp.chk('create', 'preço em texto é recusado (sem erro bruto de cast)', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":"abc","access_duration_days":30}'::jsonb)::text$q$, 'ERR=Parâmetros inválidos');
select pg_temp.chk('create', 'payload que não é objeto', $q$select public.admin_save_plan(null, '[]'::jsonb)::text$q$, 'ERR=Parâmetros inválidos');
select pg_temp.chk('create', 'payload nulo', $q$select public.admin_save_plan(null, null)::text$q$, 'ERR=Parâmetros inválidos');
select pg_temp.chk('create', 'preço anterior igual ao atual', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":50,"access_duration_days":30,"compare_price":50}'::jsonb)::text$q$, 'ERR=preço anterior deve ser maior');
select pg_temp.chk('create', 'preço anterior MENOR que o atual', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":50,"access_duration_days":30,"compare_price":40}'::jsonb)::text$q$, 'ERR=preço anterior deve ser maior');
select pg_temp.chk('create', 'preço anterior zero/negativo', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":50,"access_duration_days":30,"compare_price":0}'::jsonb)::text$q$, 'ERR=Preço anterior inválido');
select pg_temp.chk('create', 'promoção sem preço anterior', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":50,"access_duration_days":30,"promo_enabled":true}'::jsonb)::text$q$, 'ERR=Informe o preço anterior');
select pg_temp.chk('create', 'término da promoção antes do início', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":50,"access_duration_days":30,"compare_price":90,"promo_enabled":true,"promo_starts_at":"2030-02-01T00:00:00Z","promo_ends_at":"2030-01-01T00:00:00Z"}'::jsonb)::text$q$, 'ERR=término da promoção');
select pg_temp.chk('create', 'data de promoção inválida', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":50,"access_duration_days":30,"compare_price":90,"promo_enabled":true,"promo_ends_at":"ontem"}'::jsonb)::text$q$, 'ERR=Parâmetros inválidos');
select pg_temp.chk('create', 'texto auxiliar > 60', $q$select public.admin_save_plan(null, jsonb_build_object('code','PM_N','name','N','price',50,'access_duration_days',30,'tagline',repeat('x',61)))::text$q$, 'ERR=texto auxiliar');
select pg_temp.chk('create', 'texto do botão > 40', $q$select public.admin_save_plan(null, jsonb_build_object('code','PM_N','name','N','price',50,'access_duration_days',30,'cta_label',repeat('x',41)))::text$q$, 'ERR=texto do botão');
select pg_temp.chk('create', 'destaque inválido', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":50,"access_duration_days":30,"highlight":"gold"}'::jsonb)::text$q$, 'ERR=Destaque inválido');
select pg_temp.chk('create', 'contato javascript: recusado', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":50,"access_duration_days":30,"contact_url":"javascript:alert(1)"}'::jsonb)::text$q$, 'ERR=destino de contato');
select pg_temp.chk('create', 'contato http:// (sem TLS) recusado', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":50,"access_duration_days":30,"contact_url":"http://exemplo.com"}'::jsonb)::text$q$, 'ERR=destino de contato');
select pg_temp.chk('create', 'contato com espaço recusado', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":50,"access_duration_days":30,"contact_url":"https://a.com/ b"}'::jsonb)::text$q$, 'ERR=destino de contato');
select pg_temp.chk('create', 'contato // (protocol-relative) recusado', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":50,"access_duration_days":30,"contact_url":"//evil.com"}'::jsonb)::text$q$, 'ERR=destino de contato');
select pg_temp.chk('create', 'mais de 20 benefícios', $q$select public.admin_save_plan(null, jsonb_build_object('code','PM_N','name','N','price',50,'access_duration_days',30,'benefits',(select jsonb_agg(jsonb_build_object('text','b'||g)) from generate_series(1,21) g)))::text$q$, 'ERR=no máximo 20');
select pg_temp.chk('create', 'benefício vazio', $q$select public.admin_save_plan(null, '{"code":"PM_N","name":"N","price":50,"access_duration_days":30,"benefits":[{"text":"  "}]}'::jsonb)::text$q$, 'ERR=de 1 a 140');
select pg_temp.chk('create', 'benefício > 140', $q$select public.admin_save_plan(null, jsonb_build_object('code','PM_N','name','N','price',50,'access_duration_days',30,'benefits',jsonb_build_array(jsonb_build_object('text',repeat('x',141)))))::text$q$, 'ERR=de 1 a 140');
select pg_temp.chk('create', 'nenhuma tentativa inválida criou plano (atomicidade)', $q$select count(*)::text from public.plans where code in ('PM_N','PM_X')$q$, 'OK=0');

-- ================================================================ REGRAS DE EXIBIÇÃO DO DESCONTO
select pg_temp.chk('discount', 'fórmula: 89,90 -> 65,00 = 27,7', $q$select public.plan_discount_percent(65, 89.90)::text$q$, 'OK=27.7');
select pg_temp.chk('discount', 'fórmula: 100 -> 80 = 20,0', $q$select public.plan_discount_percent(80, 100)::text$q$, 'OK=20.0');
select pg_temp.chk('discount', 'fórmula: arredondamento a 1 casa (99,99 -> 66,66 = 33,3)', $q$select public.plan_discount_percent(66.66, 99.99)::text$q$, 'OK=33.3');
select pg_temp.chk('discount', 'fórmula: 100 -> 94,50 = 5,5', $q$select public.plan_discount_percent(94.50, 100)::text$q$, 'OK=5.5');
select pg_temp.chk('discount', 'sem desconto: anterior ausente', $q$select coalesce(public.plan_discount_percent(65, null)::text, 'nulo')$q$, 'OK=nulo');
select pg_temp.chk('discount', 'sem desconto: anterior zero', $q$select coalesce(public.plan_discount_percent(65, 0)::text, 'nulo')$q$, 'OK=nulo');
select pg_temp.chk('discount', 'sem desconto: anterior igual', $q$select coalesce(public.plan_discount_percent(65, 65)::text, 'nulo')$q$, 'OK=nulo');
select pg_temp.chk('discount', 'sem desconto: anterior menor', $q$select coalesce(public.plan_discount_percent(65, 50)::text, 'nulo')$q$, 'OK=nulo');
select pg_temp.chk('discount', 'sem desconto: preço atual zero', $q$select coalesce(public.plan_discount_percent(0, 50)::text, 'nulo')$q$, 'OK=nulo');
select pg_temp.chk('discount', 'sem desconto: preço atual negativo', $q$select coalesce(public.plan_discount_percent(-1, 50)::text, 'nulo')$q$, 'OK=nulo');
select pg_temp.chk('discount', 'sem desconto: preço atual nulo (sob consulta)', $q$select coalesce(public.plan_discount_percent(null, 50)::text, 'nulo')$q$, 'OK=nulo');
select pg_temp.chk('discount', 'estado da promoção: none / scheduled / active / expired', $q$select public.plan_promo_state(false, null, null) || ',' || public.plan_promo_state(true, now() + interval '1 day', null) || ',' || public.plan_promo_state(true, null, null) || ',' || public.plan_promo_state(true, null, now() - interval '1 second')$q$, 'OK=none,scheduled,active,expired');
select pg_temp.chk('discount', 'promoção desligada: sem preço anterior nem desconto no público', $q$select (select public.admin_save_plan(pg_temp.pid('a'), '{"promo_enabled":false}'::jsonb)::text) is not null and pg_temp.pub('PM_A','compare_price') = 'null' and pg_temp.pub('PM_A','discount_percent') = 'null'$q$, 'OK=true');
select pg_temp.chk('discount', 'promoção agendada (futura): não aparece ainda', $q$select (select public.admin_save_plan(pg_temp.pid('a'), jsonb_build_object('promo_enabled',true,'promo_starts_at',now() + interval '2 days','promo_ends_at',now() + interval '5 days'))::text) is not null and pg_temp.pub('PM_A','discount_percent') = 'null'$q$, 'OK=true');
select pg_temp.chk('discount', 'promoção ativa: aparece com desconto e data de término', $q$select (select public.admin_save_plan(pg_temp.pid('a'), jsonb_build_object('promo_starts_at',now() - interval '1 day','promo_ends_at',now() + interval '1 day'))::text) is not null and pg_temp.pub('PM_A','discount_percent') = '27.7' and pg_temp.pub('PM_A','promo_ends_at') <> 'null'$q$, 'OK=true');
select pg_temp.chk('discount', 'ocultar o preço anterior mantém o percentual', $q$select (select public.admin_save_plan(pg_temp.pid('a'), '{"show_compare_price":false}'::jsonb)::text) is not null and pg_temp.pub('PM_A','compare_price') = 'null' and pg_temp.pub('PM_A','discount_percent') = '27.7'$q$, 'OK=true');
select pg_temp.chk('discount', 'ocultar o percentual remove desconto e economia', $q$select (select public.admin_save_plan(pg_temp.pid('a'), '{"show_compare_price":true,"show_discount_percent":false}'::jsonb)::text) is not null and pg_temp.pub('PM_A','compare_price') = '89.90' and pg_temp.pub('PM_A','discount_percent') = 'null' and pg_temp.pub('PM_A','savings_amount') = 'null'$q$, 'OK=true');
select pg_temp.chk('discount', 'promoção encerrada no passado: some do público (e NÃO muda o preço cobrado)', $q$select (select public.admin_save_plan(pg_temp.pid('a'), jsonb_build_object('show_discount_percent',true,'promo_starts_at',now() - interval '3 days','promo_ends_at',now() - interval '1 day'))::text) is not null and pg_temp.pub('PM_A','discount_percent') = 'null' and pg_temp.pub('PM_A','price') = '65.00'$q$, 'OK=true');
select pg_temp.chk('discount', 'lista administrativa informa o estado "expired"', $q$select promo_state from public.list_platform_plans() where code = 'PM_A'$q$, 'OK=expired');
select pg_temp.chk('discount', 'reativar a janela: volta a exibir', $q$select (select public.admin_save_plan(pg_temp.pid('a'), jsonb_build_object('promo_ends_at',now() + interval '3 days'))::text) is not null and pg_temp.pub('PM_A','discount_percent') = '27.7'$q$, 'OK=true');
select pg_temp.chk('discount', 'subir o preço até o anterior é recusado (sem desconto negativo)', $q$select public.admin_save_plan(pg_temp.pid('a'), '{"price":89.90}'::jsonb)::text$q$, 'ERR=preço anterior deve ser maior');
select pg_temp.chk('discount', 'limpar o preço anterior com promoção ligada é recusado', $q$select public.admin_save_plan(pg_temp.pid('a'), '{"compare_price":null}'::jsonb)::text$q$, 'ERR=Informe o preço anterior');

-- ================================================================ EDITAR
select pg_temp.chk('update', 'edição parcial (só tagline) preserva preço, duração e limite', $q$select (select public.admin_save_plan(pg_temp.pid('a'), '{"tagline":"Nova chamada"}'::jsonb)::text) is not null and pg_temp.col('PM_A','price') = '65.00' and pg_temp.col('PM_A','access_duration_days') = '31' and pg_temp.col('PM_A','additional_user_limit') = '5' and pg_temp.col('PM_A','tagline') = 'Nova chamada'$q$, 'OK=true');
select pg_temp.chk('update', 'conta auditorias antes do salvar sem mudanças', $q$insert into cnt select pg_temp.audits('PM_A','platform.plan.details_updated') returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('update', 'salvar sem mudanças reais', $q$select (public.admin_save_plan(pg_temp.pid('a'), '{"tagline":"Nova chamada","price":65}'::jsonb))::text is not null$q$, 'OK=true');
select pg_temp.chk('update', 'salvar sem mudanças NÃO gera auditoria nova', $q$select (pg_temp.audits('PM_A','platform.plan.details_updated') = (select v from cnt))::text$q$, 'OK=true');
select pg_temp.chk('update', 'núcleo + extensão na mesma chamada (preço, limite, CTA)', $q$select (select public.admin_save_plan(pg_temp.pid('a'), '{"price":70,"additional_user_limit":8,"cta_label":"Contratar"}'::jsonb)::text) is not null and pg_temp.col('PM_A','price') = '70.00' and pg_temp.col('PM_A','additional_user_limit') = '8' and pg_temp.col('PM_A','cta_label') = 'Contratar'$q$, 'OK=true');
select pg_temp.chk('update', 'auditoria do núcleo (plan.updated)', $q$select (pg_temp.audits('PM_A','platform.plan.updated') >= 1)::text$q$, 'OK=true');
select pg_temp.chk('update', 'histórico mostra antes/depois do preço para o super (com e-mail)', $q$select (count(*) >= 1)::text from public.list_platform_plan_history(pg_temp.pid('a')) h where h.action = 'platform.plan.details_updated' and h.actor_email is not null and h.metadata ? 'from' and h.metadata ? 'to'$q$, 'OK=true');
select pg_temp.chk('update', 'histórico não contém segredos', $q$select count(*)::text from public.list_platform_plan_history(pg_temp.pid('a')) h where h.metadata::text ~* '(token|secret|password|jwt|api[_-]?key|cookie)'$q$, 'OK=0');
select pg_temp.chk('update', 'plano inexistente', $q$select public.admin_save_plan(gen_random_uuid(), '{"tagline":"x"}'::jsonb)::text$q$, 'ERR=Plano não encontrado');
select pg_temp.chk('update', 'histórico de plano inexistente', $q$select count(*)::text from public.list_platform_plan_history(gen_random_uuid())$q$, 'ERR=Plano não encontrado');
select pg_temp.chk('update', 'duração mudou: vale para novas cobranças (colunas atualizadas)', $q$select (select public.admin_save_plan(pg_temp.pid('a'), '{"access_duration_days":93}'::jsonb)::text) is not null and pg_temp.col('PM_A','access_duration_days') = '93'$q$, 'OK=true');

-- ================================================================ BENEFÍCIOS
select pg_temp.chk('benefits', 'remover da apresentação ARQUIVA (não apaga), reordenar e adicionar', $q$select (select public.admin_save_plan(pg_temp.pid('a'), jsonb_build_object('benefits', jsonb_build_array(
  jsonb_build_object('id', pg_temp.bid('PM_A','B2'), 'text', 'B2', 'highlighted', true),
  jsonb_build_object('text', 'B4', 'included', false))))::text) is not null$q$, 'OK=true');
select pg_temp.chk('benefits', 'B1 e B3 ficaram arquivados; nada foi excluído (4 linhas no total)', $q$select pg_temp.bcount('PM_A','archived')::text || '/' || pg_temp.bcount('PM_A','all')::text$q$, 'OK=2/4');
select pg_temp.chk('benefits', 'público: B2 destacado, depois B4 marcado como não incluído', $q$select pg_temp.pub('PM_A','benefits')::jsonb::text$q$, 'OK=[{"text": "B2", "included": true, "highlighted": true}, {"text": "B4", "included": false, "highlighted": false}]');
select pg_temp.chk('benefits', 'ocultar um benefício sem arquivar (visible=false)', $q$select (select public.admin_save_plan(pg_temp.pid('a'), jsonb_build_object('benefits', jsonb_build_array(
  jsonb_build_object('id', pg_temp.bid('PM_A','B2'), 'text', 'B2', 'visible', false),
  jsonb_build_object('id', pg_temp.bid('PM_A','B4'), 'text', 'B4', 'included', false))))::text) is not null and jsonb_array_length(pg_temp.pub('PM_A','benefits')::jsonb) = 1$q$, 'OK=true');
select pg_temp.chk('benefits', 'a lista administrativa ainda mostra o benefício oculto', $q$select jsonb_array_length(benefits)::text from public.list_platform_plans() where code = 'PM_A'$q$, 'OK=2');
select pg_temp.chk('benefits', 'id de benefício de OUTRO plano é recusado', $q$select public.admin_save_plan(pg_temp.pid('a'), jsonb_build_object('benefits', jsonb_build_array(jsonb_build_object('id', pg_temp.bid('MONTHLY','Acesso às ferramentas da plataforma'), 'text', 'x'))))::text$q$, 'ERR=Benefício não encontrado');
select pg_temp.chk('benefits', 'id inexistente é recusado', $q$select public.admin_save_plan(pg_temp.pid('a'), jsonb_build_object('benefits', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'text', 'x'))))::text$q$, 'ERR=Benefício não encontrado');
select pg_temp.chk('benefits', 'id que não é uuid é recusado', $q$select public.admin_save_plan(pg_temp.pid('a'), '{"benefits":[{"id":"abc","text":"x"}]}'::jsonb)::text$q$, 'ERR=Benefício inválido');
select pg_temp.chk('benefits', 'auditoria registra só contagens do benefício (sem textos)', $q$select (count(*) >= 1)::text from public.list_platform_plan_history(pg_temp.pid('a')) h where h.metadata #> '{to,benefits}' ? 'removed'$q$, 'OK=true');
select pg_temp.chk('benefits', 'benefício comercial NÃO altera permissões reais (flags e limite)', $q$select pg_temp.col('PM_A','support_enabled') || ',' || pg_temp.col('PM_A','tickets_enabled') || ',' || pg_temp.col('PM_A','additional_user_limit')$q$, 'OK=false,false,8');
select pg_temp.chk('benefits', 'texto de benefício com HTML é só texto (nenhuma interpretação no banco)', $q$select (select public.admin_save_plan(pg_temp.pid('a'), jsonb_build_object('benefits', jsonb_build_array(jsonb_build_object('text', '<script>alert(1)</script>'))))::text) is not null and pg_temp.pub('PM_A','benefits')::text like '%<script>%'$q$, 'OK=true');

-- ================================================================ STATUS / VISIBILIDADE / CHECKOUT
select pg_temp.chk('checkout', 'prepara plano pago com preço 0 pelo caminho antigo (create_platform_plan)', $q$insert into pids select 'z', public.create_platform_plan('PM_ZERO','Zero',null,0,30,null,0,false,false,false,false,false,0) returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('status', 'plano oculto no site continua ATIVO e fora do catálogo público', $q$select (select public.admin_save_plan(pg_temp.pid('a'), '{"public_visible":false}'::jsonb)::text) is not null and pg_temp.pub_count('PM_A') = 0 and pg_temp.col('PM_A','status') = 'active'$q$, 'OK=true');
select pg_temp.chk('status', 'voltar a exibir', $q$select (select public.admin_save_plan(pg_temp.pid('a'), '{"public_visible":true}'::jsonb)::text) is not null and pg_temp.pub_count('PM_A') = 1$q$, 'OK=true');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into co values (gen_random_uuid());
insert into public.companies (id, name, business_type, status) select id, '[PMTEST] c1', 'other', 'active' from co;
select pg_temp.chk('checkout', 'checkout de plano ativo no preço do banco', $q$select (select created::text from public.claim_subscription_payment((select id from co), pg_temp.pid('a'), 70, 'BRL'))$q$, 'OK=true');
select pg_temp.chk('checkout', 'checkout com valor diferente do preço do plano é recusado', $q$select (select created::text from public.claim_subscription_payment((select id from co), pg_temp.pid('a'), 65, 'BRL'))$q$, 'ERR=não corresponde ao preço do plano');
select pg_temp.chk('checkout', 'valor do pagamento já criado fica fixo (65 não existe; 70 gravado)', $q$select amount::text from public.subscription_payments where company_id = (select id from co) and plan_id = pg_temp.pid('a')$q$, 'OK=70.00');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"pm_super","role":"authenticated"}', true);
select pg_temp.chk('checkout', 'super muda o preço para 75 (cobrança já criada não é reescrita)', $q$select (select public.admin_save_plan(pg_temp.pid('a'), '{"price":75}'::jsonb)::text) is not null and pg_temp.col('PM_A','price') = '75.00'$q$, 'OK=true');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('checkout', 'a cobrança antiga segue em 70,00 e o novo preço é 75,00', $q$select (select amount::text from public.subscription_payments where company_id = (select id from co) and plan_id = pg_temp.pid('a')) || ',' || pg_temp.col('PM_A','price')$q$, 'OK=70.00,75.00');
select pg_temp.chk('checkout', 'o preço antigo (70) não é mais aceito em NOVA reserva', $q$select (select created::text from public.claim_subscription_payment((select id from co), pg_temp.pid('a'), 70, 'BRL'))$q$, 'ERR=não corresponde ao preço do plano');
select pg_temp.chk('checkout', 'plano de teste nunca é cobrado', $q$select (select created::text from public.claim_subscription_payment((select id from co), (select id from public.plans where code = 'FREE_TRIAL'), 0, 'BRL'))$q$, 'ERR=Plano sem preço');
select pg_temp.chk('checkout', 'plano personalizado (sob consulta) nunca inicia cobrança', $q$select (select created::text from public.claim_subscription_payment((select id from co), (select id from public.plans where code = 'CUSTOM'), 0, 'BRL'))$q$, 'ERR=Plano sem preço');
select pg_temp.chk('checkout', 'plano pago com preço 0 (criado pelo caminho antigo) também não é cobrado', $q$select (select created::text from public.claim_subscription_payment((select id from co), pg_temp.pid('z'), 0, 'BRL'))$q$, 'ERR=Plano sem preço');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"pm_super","role":"authenticated"}', true);
select pg_temp.chk('status', 'desativar pelo salvar: some do catálogo público', $q$select (select public.admin_save_plan(pg_temp.pid('a'), '{"status":"inactive"}'::jsonb)::text) is not null and pg_temp.pub_count('PM_A') = 0 and pg_temp.col('PM_A','status') = 'inactive'$q$, 'OK=true');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('checkout', 'checkout de plano INATIVO é recusado (chamada direta ao banco)', $q$select (select created::text from public.claim_subscription_payment((select id from co), pg_temp.pid('a'), 75, 'BRL'))$q$, 'ERR=Plano indisponível');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"pm_super","role":"authenticated"}', true);
select pg_temp.chk('status', 'reativar', $q$select (select public.admin_save_plan(pg_temp.pid('a'), '{"status":"active"}'::jsonb)::text) is not null and pg_temp.col('PM_A','status') = 'active'$q$, 'OK=true');
select pg_temp.chk('status', 'planos do sistema não podem ser desativados', $q$select public.admin_save_plan((select id from public.plans where code = 'MONTHLY'), '{"status":"inactive"}'::jsonb)::text$q$, 'ERR=Planos do sistema');

-- ================================================================ OS QUATRO PLANOS COMERCIAIS
select pg_temp.chk('commercial', 'cada plano comercial existe UMA vez (sem duplicar)', $q$select count(*)::text from (select code from public.plans where code in ('FREE_TRIAL','MONTHLY','QUARTERLY','YEARLY','CUSTOM') group by code having count(*) = 1) x$q$, 'OK=5');
select pg_temp.chk('commercial', 'durações comerciais preservadas (31 / 93 / 365)', $q$select pg_temp.col('MONTHLY','access_duration_days') || '/' || pg_temp.col('QUARTERLY','access_duration_days') || '/' || pg_temp.col('YEARLY','access_duration_days')$q$, 'OK=31/93/365');
select pg_temp.chk('commercial', 'preços comerciais preservados', $q$select pg_temp.col('MONTHLY','price') || '/' || pg_temp.col('QUARTERLY','price') || '/' || pg_temp.col('YEARLY','price')$q$, 'OK=89.00/240.00/899.00');
select pg_temp.chk('commercial', 'público lista Mensal, Trimestral e Anual na ordem comercial', $q$select string_agg(code, ',' order by sort_order) from public.get_public_plans() where code in ('FREE_TRIAL','MONTHLY','QUARTERLY','YEARLY','CUSTOM')$q$, 'OK=FREE_TRIAL,MONTHLY,QUARTERLY,YEARLY,CUSTOM');
select pg_temp.chk('commercial', 'personalizado: preço nulo no público', $q$select pg_temp.pub('CUSTOM','price') || '|' || pg_temp.pub('CUSTOM','kind')$q$, 'OK=null|custom');
select pg_temp.chk('commercial', 'personalizado NÃO aceita preço', $q$select public.admin_save_plan((select id from public.plans where code = 'CUSTOM'), '{"price":100}'::jsonb)::text$q$, 'ERR=sob consulta');
select pg_temp.chk('commercial', 'personalizado NÃO aceita promoção', $q$select public.admin_save_plan((select id from public.plans where code = 'CUSTOM'), '{"compare_price":100,"promo_enabled":true}'::jsonb)::text$q$, 'ERR=personalizado');
select pg_temp.chk('commercial', 'personalizado: nome, descrição, benefícios e contato seguro', $q$select (select public.admin_save_plan((select id from public.plans where code = 'CUSTOM'), jsonb_build_object('name','Personalizado','description','Fale conosco','contact_url','https://wa.me/5511999999999','cta_label','Entre em contato','highlight','value','benefits',jsonb_build_array(jsonb_build_object('text','Condições sob medida'))))::text) is not null and pg_temp.pub('CUSTOM','contact_url') = 'https://wa.me/5511999999999' and pg_temp.pub('CUSTOM','cta_label') = 'Entre em contato' and pg_temp.pub('CUSTOM','highlight') = 'value'$q$, 'OK=true');
select pg_temp.chk('commercial', 'contato por e-mail e por caminho interno são aceitos', $q$select (select public.admin_save_plan((select id from public.plans where code = 'CUSTOM'), '{"contact_url":"mailto:vendas@exemplo.com.br"}'::jsonb)::text) is not null and (select public.admin_save_plan((select id from public.plans where code = 'CUSTOM'), '{"contact_url":"/contato"}'::jsonb)::text) is not null$q$, 'OK=true');
select pg_temp.chk('commercial', 'teste grátis NÃO aceita promoção', $q$select public.admin_save_plan((select id from public.plans where code = 'FREE_TRIAL'), '{"compare_price":10,"promo_enabled":true}'::jsonb)::text$q$, 'ERR=teste não tem promoção');
select pg_temp.chk('commercial', 'vitalício NÃO aceita promoção e continua fora do catálogo público', $q$select (select public.admin_save_plan((select id from public.plans where code = 'LIFETIME'), '{"compare_price":10}'::jsonb)::text)$q$, 'ERR=vitalício');
select pg_temp.chk('commercial', 'vitalício fora do catálogo público', $q$select pg_temp.pub_count('LIFETIME')::text$q$, 'OK=0');

-- ================================================================ PROPAGAÇÃO OPCIONAL PARA ASSINATURAS EXISTENTES
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select id, pg_temp.pid('a'), 'active', now(), now() + interval '30 days', 'manual' from co;
insert into public.company_entitlements (company_id, plan_id, status, access_starts_at, access_expires_at, max_additional_users)
  select id, pg_temp.pid('a'), 'active', now(), now() + interval '30 days', 8 from co;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"pm_super","role":"authenticated"}', true);
select pg_temp.chk('limits', 'super reduz o limite do plano de 8 para 3 (sem propagar)', $q$select (select public.admin_save_plan(pg_temp.pid('a'), '{"additional_user_limit":3}'::jsonb)::text) is not null and pg_temp.col('PM_A','additional_user_limit') = '3'$q$, 'OK=true');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('limits', 'reduzir o limite do plano NÃO altera assinaturas existentes por padrão: entitlement segue em 8 (plano agora 3)', $q$select (select max_additional_users::text from public.company_entitlements where company_id = (select id from co)) || '/' || pg_temp.col('PM_A','additional_user_limit')$q$, 'OK=8/3');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"pm_super","role":"authenticated"}', true);
select pg_temp.chk('limits', 'propagação explícita aplica o novo limite às assinaturas ativas do plano', $q$select (select public.admin_save_plan(pg_temp.pid('a'), '{"apply_limits_to_existing":true}'::jsonb)::text) is not null$q$, 'OK=true');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('limits', 'entitlement passou a 3 e a auditoria registra quantas foram afetadas', $q$select (select max_additional_users::text from public.company_entitlements where company_id = (select id from co)) || '/' || (select (a.metadata #>> '{to,limits_applied_to_existing}') from public.audit_logs a where a.entity_id = pg_temp.pid('a') and a.action = 'platform.plan.details_updated' and a.metadata #> '{to}' ? 'limits_applied_to_existing' order by a.created_at desc limit 1)$q$, 'OK=3/1');

-- ================================================================ INTEGRIDADE DOS DADOS EXISTENTES
select pg_temp.chk('integrity', 'nenhuma assinatura/pagamento/entitlement preexistente foi alterado ou criado pelo catálogo', $q$select ((select count(*) from public.subscriptions) - (select subs from base) = 1)::text || ',' || ((select count(*) from public.subscription_payments) - (select pays from base) = 1)::text || ',' || ((select count(*) from public.company_entitlements) - (select ents from base) = 1)::text$q$, 'OK=true,true,true');
select pg_temp.chk('integrity', 'preços de TODOS os planos preexistentes continuam iguais', $q$select (select md5(string_agg(code || ':' || coalesce(price::text, '-'), ',' order by code)) from public.plans where code not like 'PM\_%') = (select price_md5 from base)$q$, 'OK=true');
-- o papel precisa ser explícito: como postgres (BYPASSRLS) o DELETE seria barrado só pela FK, não pela ausência de política
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"pm_super","role":"authenticated"}', true);
select pg_temp.chk('integrity', 'nenhum plano é excluível (sem DELETE)', $q$with d as (delete from public.plans returning 1) select count(*)::text from d$q$, 'OK=0');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('integrity', 'plano com benefícios não pode ser apagado nem por service_role (FK restrict)', $q$delete from public.plans where id = pg_temp.pid('a') returning 'x'$q$, 'ERR=');
select pg_temp.chk('integrity', 'constraints do banco recusam preço anterior <= atual mesmo por SQL direto', $q$update public.plans set compare_price = 1 where id = pg_temp.pid('a') returning 'x'$q$, 'ERR=plans_compare_above_price');
select pg_temp.chk('integrity', 'constraints: contato inválido por SQL direto', $q$update public.plans set contact_url = 'ftp://x' where id = pg_temp.pid('a') returning 'x'$q$, 'ERR=plans_contact_url_format');
select pg_temp.chk('integrity', 'constraints: moeda diferente de BRL por SQL direto', $q$update public.plans set currency = 'USD' where id = pg_temp.pid('a') returning 'x'$q$, 'ERR=plans_currency_supported');
select pg_temp.chk('integrity', 'constraints: CUSTOM com preço por SQL direto', $q$update public.plans set price = 10 where code = 'CUSTOM' returning 'x'$q$, 'ERR=plans_custom_has_no_price');

do $result$
declare v jsonb;
begin
  select jsonb_build_object('total', count(*), 'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)) into v from r;
  raise exception 'RESULT: %', v::text;
end $result$;
