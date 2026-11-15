-- =============================================================================
-- Bateria SQL — Fase 2 (apelidos de serviço, feriados da empresa, busca aproximada).
-- Migrations: 20261115100000_services_aliases, 20261115110000_company_holidays, 20261115120000_search_trgm_unaccent.
-- Roda SOMENTE no projeto TEST. Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('ffffffff-0000-0000-0000-0000000000f1', 'f2_owner', 'F2 Dono', 'f2-owner@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-0000000000f2', 'f2_emp', 'F2 Funcionario', 'f2-emp@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-0000000000f3', 'f2_other', 'F2 Outro Dono', 'f2-other@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('ffffffff-1000-0000-0000-0000000000f1', '[F2TEST] Empresa', 'beauty_salon', 'active'),
  ('ffffffff-1000-0000-0000-0000000000f3', '[F2TEST] Outra', 'beauty_salon', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('ffffffff-1000-0000-0000-0000000000f1', 'ffffffff-0000-0000-0000-0000000000f1', 'owner'),
  ('ffffffff-1000-0000-0000-0000000000f1', 'ffffffff-0000-0000-0000-0000000000f2', 'employee'),
  ('ffffffff-1000-0000-0000-0000000000f3', 'ffffffff-0000-0000-0000-0000000000f3', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c, (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual'
  from (values ('ffffffff-1000-0000-0000-0000000000f1'::uuid), ('ffffffff-1000-0000-0000-0000000000f3'::uuid)) v(c);

insert into public.services (id, company_id, name, sale_price, duration_minutes) values
  ('ffffffff-2000-0000-0000-0000000000f1', 'ffffffff-1000-0000-0000-0000000000f1', 'Higienização Interna', 150, 120);
insert into public.products (id, company_id, name, sku, barcode, unit, sale_price, stock_quantity, minimum_stock) values
  ('ffffffff-3000-0000-0000-0000000000f1', 'ffffffff-1000-0000-0000-0000000000f1', 'Cera Líquida Premium', 'CERA-01', '7891234567895', 'un', 60, 12, 5),
  ('ffffffff-3000-0000-0000-0000000000f2', 'ffffffff-1000-0000-0000-0000000000f1', 'Shampoo Automotivo', 'SHA-02', null, 'l', 35, 3, 5),
  ('ffffffff-3000-0000-0000-0000000000f3', 'ffffffff-1000-0000-0000-0000000000f1', 'Pano de Microfibra', null, '7890000000017', 'un', 12, 40, 10),
  ('ffffffff-3000-0000-0000-0000000000f9', 'ffffffff-1000-0000-0000-0000000000f3', 'Cera da Outra Empresa', 'OUT-1', '7899999999990', 'un', 99, 1, 1);

create temp table r (n serial, grp text, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
create or replace function pg_temp.chk(g text, l text, q text, e text) returns void language plpgsql as $$
declare v text; got text; pass boolean;
begin
  begin execute q into v; got := 'OK=' || coalesce(v, 'null');
  exception when others then got := 'ERR=' || sqlerrm; end;
  pass := case
    when e like 'OK=%' then got = e
    when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0
    else false end;
  insert into r(grp, label, expect, got, ok) values (g, l, e, left(got, 200), pass);
end $$;

-- ------------------------------------------------------------------ apelidos
select pg_temp.chk('apelidos', 'padrão é lista vazia', $q$select aliases::text from public.services where id = 'ffffffff-2000-0000-0000-0000000000f1'$q$, 'OK={}');
select pg_temp.chk('apelidos', 'aceita 2 apelidos', $q$update public.services set aliases = array['limpeza interna','faxina'] where id = 'ffffffff-2000-0000-0000-0000000000f1' returning cardinality(aliases)::text$q$, 'OK=2');
select pg_temp.chk('apelidos', 'recusa 11 apelidos', $q$update public.services set aliases = array['a','b','c','d','e','f','g','h','i','j','k'] where id = 'ffffffff-2000-0000-0000-0000000000f1'$q$, 'ERR=services_aliases_limits');
select pg_temp.chk('apelidos', 'recusa mais de 400 caracteres', $q$update public.services set aliases = array[repeat('x', 250), repeat('y', 250)] where id = 'ffffffff-2000-0000-0000-0000000000f1'$q$, 'ERR=services_aliases_limits');

-- ------------------------------------------------------------------ feriados da empresa
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f2_owner","role":"authenticated"}', true);
select pg_temp.chk('feriados', 'dono cadastra', $q$insert into public.company_holidays (company_id, holiday_date, name, yearly) values ('ffffffff-1000-0000-0000-0000000000f1', '2026-12-08', 'Aniversário da cidade', true) returning yearly::text$q$, 'OK=true');
select pg_temp.chk('feriados', 'padrão: empresa fechada', $q$select closed::text from public.company_holidays where name = 'Aniversário da cidade'$q$, 'OK=true');
select pg_temp.chk('feriados', 'nome vazio é recusado', $q$insert into public.company_holidays (company_id, holiday_date, name) values ('ffffffff-1000-0000-0000-0000000000f1', '2026-12-09', '   ')$q$, 'ERR=company_holidays_name_check');
select pg_temp.chk('feriados', 'mesmo dia e nome não repete', $q$insert into public.company_holidays (company_id, holiday_date, name) values ('ffffffff-1000-0000-0000-0000000000f1', '2026-12-08', 'Aniversário da cidade')$q$, 'ERR=company_holidays_company_id_holiday_date_name_key');
select pg_temp.chk('feriados', 'dono NÃO cadastra para outra empresa', $q$insert into public.company_holidays (company_id, holiday_date, name) values ('ffffffff-1000-0000-0000-0000000000f3', '2026-12-10', 'Invasão')$q$, 'ERR=row-level security');
select pg_temp.chk('feriados', 'dono NÃO troca a empresa do feriado', $q$update public.company_holidays set company_id = 'ffffffff-1000-0000-0000-0000000000f3' where name = 'Aniversário da cidade'$q$, 'ERR=');
select set_config('request.jwt.claims', '{"sub":"f2_emp","role":"authenticated"}', true);
select pg_temp.chk('feriados', 'funcionário LÊ', $q$select count(*)::text from public.company_holidays$q$, 'OK=1');
select pg_temp.chk('feriados', 'funcionário NÃO cadastra', $q$insert into public.company_holidays (company_id, holiday_date, name) values ('ffffffff-1000-0000-0000-0000000000f1', '2026-12-11', 'Folga')$q$, 'ERR=row-level security');
select pg_temp.chk('feriados', 'funcionário NÃO apaga (0 linhas)', $q$with d as (delete from public.company_holidays where name = 'Aniversário da cidade' returning 1) select count(*)::text from d$q$, 'OK=0');
select set_config('request.jwt.claims', '{"sub":"f2_other","role":"authenticated"}', true);
select pg_temp.chk('feriados', 'outra empresa NÃO vê', $q$select count(*)::text from public.company_holidays$q$, 'OK=0');
reset role;
set local role anon;
select pg_temp.chk('feriados', 'anon NÃO lê', $q$select count(*) from public.company_holidays$q$, 'ERR=permission denied');
reset role;

-- ------------------------------------------------------------------ busca aproximada
select pg_temp.chk('busca', 'extensões instaladas', $q$select count(*)::text from pg_extension where extname in ('pg_trgm','unaccent')$q$, 'OK=2');
select pg_temp.chk('busca', 'f_unaccent tira acento', $q$select public.f_unaccent('Higienização Líquida')$q$, 'OK=Higienizacao Liquida');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f2_owner","role":"authenticated"}', true);
select pg_temp.chk('busca', 'sem acento e minúsculas: "cera liquida"', $q$select name from public.search_products('ffffffff-1000-0000-0000-0000000000f1', 'cera liquida') limit 1$q$, 'OK=Cera Líquida Premium');
select pg_temp.chk('busca', 'pedaço do nome: "microf"', $q$select name from public.search_products('ffffffff-1000-0000-0000-0000000000f1', 'microf') limit 1$q$, 'OK=Pano de Microfibra');
select pg_temp.chk('busca', 'erro de digitação: "shampo automotivo"', $q$select name from public.search_products('ffffffff-1000-0000-0000-0000000000f1', 'shampo automotivo') limit 1$q$, 'OK=Shampoo Automotivo');
select pg_temp.chk('busca', 'código de barras exato vale 1', $q$select score::text from public.search_products('ffffffff-1000-0000-0000-0000000000f1', '7891234567895') limit 1$q$, 'OK=1');
select pg_temp.chk('busca', 'SKU exato', $q$select name from public.search_products('ffffffff-1000-0000-0000-0000000000f1', 'SHA-02') limit 1$q$, 'OK=Shampoo Automotivo');
select pg_temp.chk('busca', 'devolve estoque e mínimo', $q$select stock_quantity::text || '/' || minimum_stock::text from public.search_products('ffffffff-1000-0000-0000-0000000000f1', 'shampoo') limit 1$q$, 'OK=3.000/5.000');
select pg_temp.chk('busca', 'não acha o que não existe', $q$select count(*)::text from public.search_products('ffffffff-1000-0000-0000-0000000000f1', 'zzzxxyy')$q$, 'OK=0');
select pg_temp.chk('busca', 'curinga % e _ são texto, não curinga', $q$select count(*)::text from public.search_products('ffffffff-1000-0000-0000-0000000000f1', '%%')$q$, 'OK=0');
select pg_temp.chk('busca', 'consulta curta demais (1 letra) não devolve', $q$select count(*)::text from public.search_products('ffffffff-1000-0000-0000-0000000000f1', 'c')$q$, 'OK=0');
select pg_temp.chk('busca', 'limite respeitado', $q$select count(*)::text from public.search_products('ffffffff-1000-0000-0000-0000000000f1', 'a', 1)$q$, 'OK=0');
select pg_temp.chk('busca', 'NÃO enxerga produto de outra empresa (RLS)', $q$select count(*)::text from public.search_products('ffffffff-1000-0000-0000-0000000000f3', 'cera')$q$, 'OK=0');
select set_config('request.jwt.claims', '{"sub":"f2_other","role":"authenticated"}', true);
select pg_temp.chk('busca', 'a outra empresa vê só o dela', $q$select name from public.search_products('ffffffff-1000-0000-0000-0000000000f3', 'cera') limit 1$q$, 'OK=Cera da Outra Empresa');
select pg_temp.chk('busca', 'e NÃO o produto da primeira', $q$select count(*)::text from public.search_products('ffffffff-1000-0000-0000-0000000000f1', 'cera')$q$, 'OK=0');
reset role;
set local role anon;
select pg_temp.chk('busca', 'anon NÃO chama', $q$select count(*) from public.search_products('ffffffff-1000-0000-0000-0000000000f1', 'cera')$q$, 'ERR=permission denied');
reset role;

do $result$
declare v jsonb;
begin
  select jsonb_build_object(
    'total', count(*),
    'pass', count(*) filter (where ok),
    'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)
  ) into v from r;
  raise exception 'RESULT: %', v::text;
end
$result$;
