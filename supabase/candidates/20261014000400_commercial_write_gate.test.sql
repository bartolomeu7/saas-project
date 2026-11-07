-- =============================================================================
-- Bateria SQL — Gate Integral de acesso comercial (a0_commercial_write_gate). Roda SOMENTE em banco de TESTE descartável.
-- Uma transação que termina em erro proposital (RESULT: ...): nada persiste. Substitui, para o desenho final, a parte
-- "ACESSO AOS DADOS" da tests/sql/mission09.sql (escrita para a rejeitada 20261014000300).
-- Requer a candidata 20261014000400_commercial_write_gate.sql instalada (NÃO executada na Fase 3). JWT do Clerk simulado por request.jwt.claims.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

update public.profiles set clerk_user_id = 'gt_admin' where user_id = '5280eb70-5ca1-47f2-b154-9a47dbe0b021';
select set_config('app.platform_profile_write', 'on', true);
update public.profiles set role = 'admin' where user_id = '5280eb70-5ca1-47f2-b154-9a47dbe0b021';
select set_config('app.platform_profile_write', 'off', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status)
select ('ffffffff-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'gt_u' || g, 'GT Usuário ' || g, 'gt-u' || g || '@example.invalid', 'user', 'active'
  from generate_series(1, 10) g;
-- u1..u8 = donos das empresas a..h ; u9 = invasor (sem empresa) ; u10 = usuário novo (cria empresa)

create temp table cos (k text primary key, id uuid, owner int);
insert into cos select k, gen_random_uuid(), n from (values ('a',1),('b',2),('c',3),('d',4),('e',5),('f',6),('g',7),('h',8)) v(k, n);
insert into public.companies (id, name, business_type, status) select id, '[GTTEST] ' || k, 'other', 'active' from cos;
insert into public.company_members (company_id, user_id, role)
  select id, ('ffffffff-0000-0000-0000-' || lpad(owner::text, 12, '0'))::uuid, 'owner' from cos;
-- a: ativa | b: vencida | c: cancelada | d: SEM assinatura | e: trial vigente | f: vitalícia | g: trial vencido | h: status expired
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
select c.id, (select id from public.plans where code = 'MONTHLY'),
       case c.k when 'a' then 'active' when 'b' then 'active' when 'c' then 'cancelled' when 'e' then 'trialing' when 'g' then 'trialing' when 'h' then 'expired' end::public.subscription_status,
       now() - interval '40 days',
       case c.k when 'a' then now() + interval '20 days' when 'e' then now() + interval '1 day' when 'c' then now() + interval '20 days' else now() - interval '5 days' end,
       'manual'
  from cos c where c.k in ('a','b','c','e','g','h');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider, lifetime)
  select c.id, (select id from public.plans where code = 'LIFETIME'), 'active', now() - interval '10 days', null, 'manual', true from cos c where c.k = 'f';
-- o perfil profissional do dono é criado pelo gatilho seed_professional_profile_from_member
insert into public.customers (company_id, name) select id, 'cliente existente' from cos where k in ('a','b');

create temp table r (n serial, grp text, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
grant all on cos to authenticated, anon;
create or replace function pg_temp.co(k text) returns uuid language sql as $$ select id from cos where cos.k = $1 $$;
grant execute on function pg_temp.co(text) to authenticated, anon;
create or replace function pg_temp.prof(k text) returns uuid language sql security definer as $$ select id from public.professional_profiles where company_id = (select id from cos where cos.k = $1) $$;
grant execute on function pg_temp.prof(text) to authenticated, anon;
create or replace function pg_temp.chk(g text, l text, q text, e text) returns void language plpgsql as $$
declare v text; got text; pass boolean;
begin
  begin execute q into v; got := 'OK=' || coalesce(v, 'null');
  exception when others then got := 'ERR=' || sqlerrm; end;
  pass := case
    when e = 'OK' then got like 'OK=%'
    when e like 'OK=%' then got = e
    when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0
    when e like 'NOTERR=%' then not (got like 'ERR=%' and position(substr(e, 8) in got) > 0)
    else false end;
  insert into r(grp, label, expect, got, ok) values (g, l, e, left(got, 200), pass);
end $$;
grant execute on function pg_temp.chk(text, text, text, text) to authenticated, anon;
-- sonda: tenta inserir uma linha mínima em cada uma das 36 tabelas. O gatilho roda ANTES de NOT NULL/CHECK/RLS.
-- devolve "recusadas pelo gate / tabelas / outras respostas"
create or replace function pg_temp.probe(p_company uuid, p_prof uuid) returns text language plpgsql as $$
declare t text; denied int := 0; total int := 0; other int := 0; msg text;
begin
  foreach t in array array['accounts_payable','appointments','cash_movements','cash_registers','company_settings','cost_centers',
    'customer_documents','customer_raffle_entries','customer_raffles','customers','financial_categories',
    'financial_entries','loyalty_accounts','loyalty_campaigns','loyalty_multipliers','loyalty_settings',
    'loyalty_tier_thresholds','loyalty_transactions','product_categories','products','professional_blocks',
    'professional_profiles','purchase_order_items','purchase_orders','purchase_receipt_items','purchase_receipts',
    'sale_items','sale_payments','sales','service_categories','services','stock_movements','supplier_products','suppliers']
  loop
    total := total + 1;
    begin execute format('insert into public.%I (company_id) values (%L)', t, p_company); other := other + 1;
    exception when others then
      get stacked diagnostics msg = message_text;
      if msg like 'COMMERCIAL_ACCESS_REQUIRED%' then denied := denied + 1; else other := other + 1; end if;
    end;
  end loop;
  foreach t in array array['professional_availability','professional_services'] loop
    total := total + 1;
    begin execute format('insert into public.%I (professional_id) values (%L)', t, p_prof); other := other + 1;
    exception when others then
      get stacked diagnostics msg = message_text;
      if msg like 'COMMERCIAL_ACCESS_REQUIRED%' then denied := denied + 1; else other := other + 1; end if;
    end;
  end loop;
  return denied || '/' || total || '/' || other;
end $$;
grant execute on function pg_temp.probe(uuid, uuid) to authenticated, anon;
create or replace function pg_temp.pr(k text) returns text language sql as $$ select pg_temp.probe(pg_temp.co($1), pg_temp.prof($1)) $$;
grant execute on function pg_temp.pr(text) to authenticated, anon;
create or replace function pg_temp.hint_of(q text) returns text language plpgsql as $$
declare h text; begin execute q; return 'sem erro'; exception when others then get stacked diagnostics h = pg_exception_hint; return coalesce(h, 'sem hint'); end $$;
grant execute on function pg_temp.hint_of(text) to authenticated, anon;

-- ================================================================ ESTRUTURA
select pg_temp.chk('struct', '36 gatilhos a0_commercial_write_gate habilitados', $q$select count(*)::text from pg_trigger where tgname = 'a0_commercial_write_gate' and tgenabled = 'O' and not tgisinternal$q$, 'OK=36');
select pg_temp.chk('struct', 'authenticated/anon NÃO executam as 3 funções do gate', $q$select count(*)::text from (values ('public.commercial_gate_is_user_context()'),('public.company_write_allowed(uuid)'),('public.enforce_company_write_access()')) f(s), (values ('anon'),('authenticated')) ro(r) where has_function_privilege(ro.r, f.s, 'execute')$q$, 'OK=0');
select pg_temp.chk('struct', 'funções SECURITY DEFINER com search_path vazio', $q$select count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and proname in ('company_write_allowed','enforce_company_write_access') and prosecdef and array_to_string(proconfig, ',') = 'search_path=""'$q$, 'OK=2');
select pg_temp.chk('struct', 'nenhuma policy de SELECT foi criada/alterada pelo gate (88 policies)', $q$select count(*)::text from pg_policies where schemaname = 'public'$q$, 'OK=88');

-- ================================================================ MATRIZ 36 TABELAS (membro dono de cada empresa)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"gt_u1","role":"authenticated"}', true);
select pg_temp.chk('matrix', 'A (assinatura ativa): 0 de 36 recusadas', $q$select split_part(pg_temp.pr('a'), '/', 1) || '/' || split_part(pg_temp.pr('a'), '/', 2)$q$, 'OK=0/36');
select set_config('request.jwt.claims', '{"sub":"gt_u2","role":"authenticated"}', true);
select pg_temp.chk('matrix', 'B (VENCIDA): 36 de 36 recusadas, nenhuma passa', $q$select pg_temp.pr('b')$q$, 'OK=36/36/0');
select set_config('request.jwt.claims', '{"sub":"gt_u3","role":"authenticated"}', true);
select pg_temp.chk('matrix', 'C (CANCELADA, ainda no prazo): 36 de 36 recusadas', $q$select pg_temp.pr('c')$q$, 'OK=36/36/0');
select set_config('request.jwt.claims', '{"sub":"gt_u4","role":"authenticated"}', true);
select pg_temp.chk('matrix', 'D (SEM assinatura): 36 de 36 recusadas', $q$select pg_temp.pr('d')$q$, 'OK=36/36/0');
select set_config('request.jwt.claims', '{"sub":"gt_u5","role":"authenticated"}', true);
select pg_temp.chk('matrix', 'E (trial vigente): 0 de 36 recusadas', $q$select split_part(pg_temp.pr('e'), '/', 1)$q$, 'OK=0');
select set_config('request.jwt.claims', '{"sub":"gt_u6","role":"authenticated"}', true);
select pg_temp.chk('matrix', 'F (VITALÍCIA): 0 de 36 recusadas', $q$select split_part(pg_temp.pr('f'), '/', 1)$q$, 'OK=0');
select set_config('request.jwt.claims', '{"sub":"gt_u7","role":"authenticated"}', true);
select pg_temp.chk('matrix', 'G (trial VENCIDO): 36 de 36 recusadas', $q$select pg_temp.pr('g')$q$, 'OK=36/36/0');
select set_config('request.jwt.claims', '{"sub":"gt_u8","role":"authenticated"}', true);
select pg_temp.chk('matrix', 'H (status expired): 36 de 36 recusadas', $q$select pg_temp.pr('h')$q$, 'OK=36/36/0');

-- ================================================================ SEM ORÁCULO ENTRE EMPRESAS (não membro)
select set_config('request.jwt.claims', '{"sub":"gt_u9","role":"authenticated"}', true);
select pg_temp.chk('oracle', 'invasor em empresa VENCIDA: 0 mensagens comerciais', $q$select split_part(pg_temp.pr('b'), '/', 1)$q$, 'OK=0');
select pg_temp.chk('oracle', 'invasor em empresa SEM assinatura: 0 mensagens comerciais', $q$select split_part(pg_temp.pr('d'), '/', 1)$q$, 'OK=0');
select pg_temp.chk('oracle', 'invasor em empresa ATIVA: 0 mensagens comerciais', $q$select split_part(pg_temp.pr('a'), '/', 1)$q$, 'OK=0');
select pg_temp.chk('oracle', 'invasor com UUID inexistente: mesma resposta (RLS)', $q$insert into public.customers(company_id, name) values (gen_random_uuid(), 'x') returning 'x'$q$, 'ERR=row-level security');
select pg_temp.chk('oracle', 'invasor em empresa vencida: também RLS', $q$insert into public.customers(company_id, name) values (pg_temp.co('b'), 'x') returning 'x'$q$, 'ERR=row-level security');

-- ================================================================ UPDATE / DELETE / leitura / mensagem
select set_config('request.jwt.claims', '{"sub":"gt_u2","role":"authenticated"}', true);
select pg_temp.chk('dml', 'B: INSERT direto em customers recusado com a mensagem estável', $q$insert into public.customers(company_id, name) values (pg_temp.co('b'), 'novo') returning 'x'$q$, 'ERR=COMMERCIAL_ACCESS_REQUIRED');
select pg_temp.chk('dml', 'B: UPDATE de linha existente recusado', $q$update public.customers set name = 'z' where company_id = pg_temp.co('b') returning 'x'$q$, 'ERR=COMMERCIAL_ACCESS_REQUIRED');
select pg_temp.chk('dml', 'B: DELETE de linha existente recusado', $q$delete from public.customers where company_id = pg_temp.co('b') returning 'x'$q$, 'ERR=COMMERCIAL_ACCESS_REQUIRED');
select pg_temp.chk('dml', 'B: UPDATE que afeta 0 linhas NÃO dispara (limite conhecido, nada é alterado)', $q$with u as (update public.customers set name = 'z' where company_id = pg_temp.co('b') and name = 'nao existe' returning 1) select count(*)::text from u$q$, 'OK=0');
select pg_temp.chk('dml', 'B: leitura continua (SELECT)', $q$select count(*)::text from public.customers where company_id = pg_temp.co('b')$q$, 'OK=1');
select pg_temp.chk('dml', 'B: o HINT orienta a regularização e informa que leitura/exportação seguem', $q$select pg_temp.hint_of($h$insert into public.customers(company_id, name) values (pg_temp.co('b'), 'x')$h$)$q$, 'OK=Renove ou regularize a assinatura. Leitura e exportação continuam disponíveis.');
select pg_temp.chk('dml', 'B: dado intacto após as tentativas', $q$select name from public.customers where company_id = pg_temp.co('b')$q$, 'OK=cliente existente');
select pg_temp.chk('dml', 'B: UPDATE direto em subscriptions pelo membro: 0 linhas (RLS)', $q$with u as (update public.subscriptions set expires_at = now() + interval '9999 days' where company_id = pg_temp.co('b') returning 1) select count(*)::text from u$q$, 'OK=0');
select set_config('request.jwt.claims', '{"sub":"gt_u1","role":"authenticated"}', true);
select pg_temp.chk('dml', 'A: INSERT, UPDATE e DELETE funcionam', $q$with i as (insert into public.customers(company_id, name) values (pg_temp.co('a'), 'novo') returning id), u as (update public.customers set name = 'z' where company_id = pg_temp.co('a') and name = 'cliente existente' returning 1) select (select count(*) from i)::text || ',' || (select count(*) from u)::text$q$, 'OK=1,1');
select pg_temp.chk('dml', 'A: DELETE funciona', $q$with d as (delete from public.customers where company_id = pg_temp.co('a') and name = 'novo' returning 1) select count(*)::text from d$q$, 'OK=1');

-- ================================================================ RPCs de negócio (SECURITY DEFINER) — caminho indireto
select set_config('request.jwt.claims', '{"sub":"gt_u2","role":"authenticated"}', true);
select pg_temp.chk('rpc', 'B: open_cash_register recusada', $q$select public.open_cash_register(10, 'x')::text$q$, 'ERR=COMMERCIAL_ACCESS_REQUIRED');
select pg_temp.chk('rpc', 'B: create_cost_center recusada', $q$select public.create_cost_center('GT CC')::text$q$, 'ERR=COMMERCIAL_ACCESS_REQUIRED');
select pg_temp.chk('rpc', 'B: create_financial_category recusada', $q$select public.create_financial_category('GT cat', 'income')::text$q$, 'ERR=COMMERCIAL_ACCESS_REQUIRED');
select pg_temp.chk('rpc', 'B: create_financial_entry recusada', $q$select public.create_financial_entry('income', 'GT', 10, current_date, 'pix', null, null, null)::text$q$, 'ERR=COMMERCIAL_ACCESS_REQUIRED');
select pg_temp.chk('rpc', 'B: upsert_professional_profile recusada', $q$select public.upsert_professional_profile((select id from public.company_members where company_id = pg_temp.co('b') limit 1), 'GT', null, null, 'sky', null, true)::text$q$, 'ERR=COMMERCIAL_ACCESS_REQUIRED');
select set_config('request.jwt.claims', '{"sub":"gt_u1","role":"authenticated"}', true);
select pg_temp.chk('rpc', 'A: open_cash_register funciona', $q$select public.open_cash_register(10, 'x')::text$q$, 'OK');
select pg_temp.chk('rpc', 'A: create_cost_center funciona', $q$select public.create_cost_center('GT CC')::text$q$, 'OK');
select pg_temp.chk('rpc', 'A: create_financial_category funciona', $q$select public.create_financial_category('GT cat', 'income')::text$q$, 'OK');

-- ================================================================ service_role, manutenção e cascata
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('system', 'service_role grava em empresa vencida (webhook/servidor)', $q$insert into public.customers(company_id, name) values (pg_temp.co('b'), 'via service') returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('system', 'service_role: sonda 0 recusadas em B', $q$select split_part(pg_temp.pr('b'), '/', 1)$q$, 'OK=0');
select set_config('request.jwt.claims', '', true);
select pg_temp.chk('system', 'conexão interna SEM JWT (manutenção/migrations) grava em empresa vencida', $q$insert into public.customers(company_id, name) values (pg_temp.co('b'), 'manutencao') returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('system', 'JWT ilegível, depois sem papel: o gate falha FECHADO para usuário', $q$select (set_config('request.jwt.claims', '{lixo', true) is not null)::text$q$, 'OK=true');
select pg_temp.chk('system', 'com JWT corrompido o gate trata como usuário (sem exceção de sintaxe)', $q$select public.commercial_gate_is_user_context()::text$q$, 'OK=true');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ================================================================ D4: criar empresa sem trial; cascata (semente) passa
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"gt_u10","role":"authenticated"}', true);
select pg_temp.chk('d4', 'usuário novo cria empresa (sem autorização de teste: sem assinatura); a semente financeira (cascata) passa', $q$select (public.create_company_with_owner('[GTTEST] nova', 'other')).name$q$, 'OK=[GTTEST] nova');
select pg_temp.chk('d4', 'semente financeira criada (cascata não bloqueada)', $q$select (count(*) > 0)::text from public.financial_categories where company_id = (select company_id from public.company_members where user_id = 'ffffffff-0000-0000-0000-000000000010')$q$, 'OK=true');
select pg_temp.chk('d4', 'empresa nova sem assinatura: gravação recusada', $q$insert into public.customers(company_id, name) select company_id, 'x' from public.company_members where user_id = 'ffffffff-0000-0000-0000-000000000010' returning 'x'$q$, 'ERR=COMMERCIAL_ACCESS_REQUIRED');
select pg_temp.chk('d4', 'empresa nova: leitura funciona', $q$select (count(*) >= 0)::text from public.customers$q$, 'OK=true');

-- ================================================================ regularizar / expirar (estado lido a cada linha)
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.subscriptions set expires_at = now() + interval '10 days', status = 'active' where company_id = pg_temp.co('b');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"gt_u2","role":"authenticated"}', true);
select pg_temp.chk('flip', 'B regularizada: a gravação libera na MESMA transação', $q$insert into public.customers(company_id, name) values (pg_temp.co('b'), 'apos renovar') returning 'ok'$q$, 'OK=ok');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.subscriptions set expires_at = now() - interval '1 second' where company_id = pg_temp.co('b');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"gt_u2","role":"authenticated"}', true);
select pg_temp.chk('flip', 'B expira no meio da transação: a próxima gravação já é recusada (regra volátil)', $q$insert into public.customers(company_id, name) values (pg_temp.co('b'), 'apos expirar') returning 'ok'$q$, 'ERR=COMMERCIAL_ACCESS_REQUIRED');

-- ================================================================ administração/billing NÃO são bloqueados
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"gt_admin","role":"authenticated"}', true);
select pg_temp.chk('admin', 'admin concede 30 dias à empresa VENCIDA (escreve em subscriptions: fora do gate)', $q$select (public.admin_grant_license(pg_temp.co('b'), 'thirty_days', null, null, 'regularizacao GT', gen_random_uuid()))->>'status'$q$, 'OK=active');
select set_config('request.jwt.claims', '{"sub":"gt_u2","role":"authenticated"}', true);
select pg_temp.chk('admin', 'após a concessão o dono volta a gravar', $q$insert into public.customers(company_id, name) values (pg_temp.co('b'), 'depois da concessao') returning 'ok'$q$, 'OK=ok');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temp table pay_d as select (c.payment_id) id from public.claim_subscription_payment(pg_temp.co('d'), (select id from public.plans where code = 'MONTHLY'), 89, 'BRL') c;
update public.subscription_payments set provider_transaction_id = 'tx_gt_d' where id = (select id from pay_d);
select pg_temp.chk('admin', 'confirmação de pagamento (service_role) em empresa sem assinatura cria o acesso', $q$select (c.ok::text || ',' || c.new_status::text) from public.confirm_subscription_payment((select id from pay_d), 'paid', 'E2E-GT', 'gt:d:1', 'pix.status_check', '{}'::jsonb, 89) c$q$, 'OK=true,paid');
select pg_temp.chk('admin', 'D tem assinatura ativa após o pagamento confirmado', $q$select status::text from public.subscriptions where company_id = pg_temp.co('d')$q$, 'OK=active');

do $result$
declare v jsonb;
begin
  select jsonb_build_object('total', count(*), 'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)) into v from r;
  raise exception 'RESULT: %', v::text;
end $result$;
