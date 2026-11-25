-- =============================================================================
-- Bateria SQL das ordens de pagamento e chamados (migration 20261125160000_payment_orders_support.sql).
-- Cobre numeração (única, sequencial, imutável), isolamento entre empresas, limites dos chamados, painel e permissões.
-- Uma transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temp table r (n serial, grp text, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
create or replace function pg_temp.chk(g text, l text, q text, e text) returns void language plpgsql as $$
declare v text; got text; pass boolean;
begin
  begin execute q into v; got := 'OK=' || coalesce(v, 'null');
  exception when others then got := 'ERR=' || sqlerrm; end;
  pass := case when e like 'OK=%' then got = e
               when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0
               else false end;
  insert into r(grp, label, expect, got, ok) values (g, l, e, left(got, 200), pass);
end $$;
grant execute on function pg_temp.chk(text, text, text, text) to authenticated, anon;

create temp table ctx as select
  (select id from public.plans where code = 'MONTHLY') monthly,
  gen_random_uuid() c1, gen_random_uuid() c2, gen_random_uuid() u1, gen_random_uuid() u2,
  gen_random_uuid() p1, gen_random_uuid() p2;
grant select on ctx to authenticated, anon;
insert into public.companies (id, name, business_type, status)
  select x.id, x.n, 'other', 'active' from (select c1 id, '[ORDTEST] c1' n from ctx union all select c2, '[ORDTEST] c2' from ctx) x;
insert into public.profiles (user_id, clerk_user_id, email, role, status)
  select u1, 'ord_u1', 'ord_u1@teste.invalid', 'user'::public.user_role, 'active'::public.user_status from ctx
  union all select u2, 'ord_u2', 'ord_u2@teste.invalid', 'user'::public.user_role, 'active'::public.user_status from ctx;
insert into public.company_members (company_id, user_id, role)
  select c1, u1, 'owner'::public.company_role from ctx union all select c2, u2, 'owner'::public.company_role from ctx;
insert into public.subscription_payments (id, company_id, plan_id, provider, status, amount, charge_method)
  select p1, c1, monthly, 'misticpay', 'pending', 89, 'pix' from ctx;
insert into public.subscription_payments (id, company_id, plan_id, provider, status, amount, charge_method)
  select p2, c2, monthly, 'misticpay', 'pending', 89, 'pix' from ctx;
update public.profiles set clerk_user_id = 'ord_admin' where user_id = (select user_id from public.profiles where role in ('admin', 'super_admin') and status = 'active' order by created_at limit 1);

-- ============================================================ A) NUMERAÇÃO
select pg_temp.chk('numero', 'toda cobrança tem número e nenhum se repete', $q$select (count(*) = count(distinct order_number) and count(*) = count(order_number))::text from public.subscription_payments$q$, 'OK=true');
select pg_temp.chk('numero', 'cobrança nova recebe número maior que a anterior', $q$select ((select order_number from public.subscription_payments where id = (select p2 from ctx)) > (select order_number from public.subscription_payments where id = (select p1 from ctx)))::text$q$, 'OK=true');
select pg_temp.chk('numero', 'número não pode ser alterado', $q$update public.subscription_payments set order_number = 1 where id = (select p1 from ctx) returning 'x'$q$, 'ERR=can only be updated to DEFAULT');
select pg_temp.chk('numero', 'número não pode ser escolhido na inserção', $q$insert into public.subscription_payments (company_id, plan_id, provider, status, amount, order_number) values ((select c1 from ctx), (select monthly from ctx), 'manual', 'paid', 1, 1) returning 'x'$q$, 'ERR=non-DEFAULT value');
select pg_temp.chk('numero', 'formato OP-000007', $q$select public.payment_order_code(7)$q$, 'OK=OP-000007');
select pg_temp.chk('numero', 'número grande não é cortado', $q$select public.payment_order_code(12345678)$q$, 'OK=OP-12345678');

-- ============================================================ B) CLIENTE
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ord_u1","role":"authenticated"}', true);
select pg_temp.chk('cliente', 'assunto inválido é recusado', $q$select public.open_payment_ticket((select p1 from ctx), 'hack', 'mensagem com tamanho ok')::text$q$, 'ERR=assunto');
select pg_temp.chk('cliente', 'mensagem curta é recusada', $q$select public.open_payment_ticket((select p1 from ctx), 'other', '   oi    ')::text$q$, 'ERR=10 a 1000');
select pg_temp.chk('cliente', 'mensagem longa é recusada', $q$select public.open_payment_ticket((select p1 from ctx), 'other', repeat('a', 1001))::text$q$, 'ERR=10 a 1000');
select pg_temp.chk('cliente', 'ordem de OUTRA empresa é recusada', $q$select public.open_payment_ticket((select p2 from ctx), 'other', 'tentando abrir na ordem alheia')::text$q$, 'ERR=não encontrada');
select pg_temp.chk('cliente', 'ordem inexistente tem a mesma resposta', $q$select public.open_payment_ticket(gen_random_uuid(), 'other', 'ordem que nao existe aqui')::text$q$, 'ERR=não encontrada');
select pg_temp.chk('cliente', 'abre chamado na própria ordem', $q$select (public.open_payment_ticket((select p1 from ctx), 'paid_not_released', E'Paguei e não liberou.\nSegunda linha.') is not null)::text$q$, 'OK=true');
select pg_temp.chk('cliente', 'segundo chamado aberto na mesma ordem é recusado', $q$select public.open_payment_ticket((select p1 from ctx), 'other', 'outro chamado repetido')::text$q$, 'ERR=Já existe um chamado aberto');
select pg_temp.chk('cliente', 'vê o próprio chamado, com a quebra de linha preservada', $q$select (count(*)::text || ',' || bool_and(position(E'\n' in message) > 0)::text) from public.payment_support_tickets$q$, 'OK=1,true');
select pg_temp.chk('cliente', 'NÃO lê quem abriu (coluna interna)', $q$select opened_by::text from public.payment_support_tickets limit 1$q$, 'ERR=permission denied');
select pg_temp.chk('cliente', 'NÃO insere direto', $q$insert into public.payment_support_tickets (payment_id, company_id, reason, message) values ((select p1 from ctx), (select c1 from ctx), 'other', 'insercao direta') returning 'x'$q$, 'ERR=permission denied');
select pg_temp.chk('cliente', 'NÃO responde o próprio chamado', $q$update public.payment_support_tickets set reply = 'auto' returning 'x'$q$, 'ERR=permission denied');
select pg_temp.chk('cliente', 'NÃO apaga chamado', $q$delete from public.payment_support_tickets returning 'x'$q$, 'ERR=permission denied');
select pg_temp.chk('cliente', 'NÃO lista os chamados da plataforma', $q$select count(*)::text from public.list_platform_payment_tickets()$q$, 'ERR=not authorized');
select pg_temp.chk('cliente', 'NÃO resolve chamado', $q$select public.resolve_platform_payment_ticket(gen_random_uuid(), 'resolvido')::text$q$, 'ERR=not authorized');

select set_config('request.jwt.claims', '{"sub":"ord_u2","role":"authenticated"}', true);
select pg_temp.chk('isolamento', 'outra empresa NÃO vê o chamado', $q$select count(*)::text from public.payment_support_tickets$q$, 'OK=0');
select set_config('request.jwt.claims', '{"sub":"ninguem","role":"authenticated"}', true);
select pg_temp.chk('isolamento', 'sessão sem perfil não abre chamado', $q$select public.open_payment_ticket((select p1 from ctx), 'other', 'sessao sem perfil aqui')::text$q$, 'ERR=not authorized');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('anon', 'anon não abre chamado', $q$select public.open_payment_ticket(gen_random_uuid(), 'other', 'anonimo tentando abrir')::text$q$, 'ERR=permission denied');
select pg_temp.chk('anon', 'anon não lê chamados', $q$select count(*)::text from public.payment_support_tickets$q$, 'ERR=permission denied');
select pg_temp.chk('anon', 'anon não lista pagamentos do painel', $q$select count(*)::text from public.list_platform_payments()$q$, 'ERR=permission denied');

-- ============================================================ C) PAINEL
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ord_admin","role":"authenticated"}', true);
select pg_temp.chk('painel', 'lista o chamado aberto com ordem, empresa e e-mail', $q$select (company_name || ',' || opened_by_email || ',' || status || ',' || (order_number > 0)::text) from public.list_platform_payment_tickets('open') where company_name like '[ORDTEST]%'$q$, 'OK=[ORDTEST] c1,ord_u1@teste.invalid,open,true');
select pg_temp.chk('painel', 'busca pelo código da ordem acha a cobrança', $q$select count(*)::text from public.list_platform_payments(p_search => (select public.payment_order_code(order_number) from public.list_platform_payment_tickets('open') where company_name = '[ORDTEST] c1')) where company_name = '[ORDTEST] c1'$q$, 'OK=1');
select pg_temp.chk('painel', 'lista devolve o número da ordem', $q$select bool_and(order_number is not null)::text from public.list_platform_payments(p_search => '[ORDTEST]')$q$, 'OK=true');
select pg_temp.chk('painel', 'detalhe traz número e chamado', $q$select ((d -> 'payment' ->> 'order_number') is not null)::text || ',' || jsonb_array_length(d -> 'tickets')::text from public.get_platform_payment_detail((select p1 from ctx)) d$q$, 'OK=true,1');
select pg_temp.chk('painel', 'resposta vazia é recusada', $q$select public.resolve_platform_payment_ticket((select ticket_id from public.list_platform_payment_tickets('open') where company_name = '[ORDTEST] c1'), '  ')::text$q$, 'ERR=3 a 1000');
create temp table tk as select ticket_id id from public.list_platform_payment_tickets('open') where company_name = '[ORDTEST] c1';
select pg_temp.chk('painel', 'admin responde e resolve', $q$select public.resolve_platform_payment_ticket((select id from tk), 'Pagamento conferido e acesso liberado.')::text$q$, 'OK=');
select pg_temp.chk('painel', 'não resolve duas vezes', $q$select public.resolve_platform_payment_ticket((select id from tk), 'de novo')::text$q$, 'ERR=já foi resolvido');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('painel', 'resolver não muda o pagamento', $q$select status::text from public.subscription_payments where id = (select p1 from ctx)$q$, 'OK=pending');
select pg_temp.chk('painel', 'abertura e resolução ficam na auditoria', $q$select count(*)::text from public.audit_logs where entity_id = (select p1 from ctx) and action in ('subscription_payment.ticket_opened', 'platform.support.ticket_resolved')$q$, 'OK=2');

-- ============================================================ D) LIMITE DIÁRIO E EXCLUSÃO
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ord_u1","role":"authenticated"}', true);
select pg_temp.chk('cliente', 'vê a resposta no chamado resolvido', $q$select reply from public.payment_support_tickets where status = 'resolved'$q$, 'OK=Pagamento conferido e acesso liberado.');
select pg_temp.chk('cliente', 'depois de resolvido, pode abrir outro', $q$select (public.open_payment_ticket((select p1 from ctx), 'other', 'ainda com problema aqui') is not null)::text$q$, 'OK=true');
reset role;
update public.payment_support_tickets set status = 'resolved', reply = 'ok ok', resolved_at = now() where company_id = (select c1 from ctx) and status = 'open';
insert into public.payment_support_tickets (payment_id, company_id, reason, message, status, reply, resolved_at)
  select p1, c1, 'other', 'chamado para o limite', 'resolved', 'ok ok', now() from ctx, generate_series(1, 8);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ord_u1","role":"authenticated"}', true);
select pg_temp.chk('limite', '11º chamado em 24 h é recusado', $q$select public.open_payment_ticket((select p1 from ctx), 'other', 'mais um chamado do dia')::text$q$, 'ERR=Limite de chamados');
reset role;
delete from public.subscription_payments where id = (select p1 from ctx);
select pg_temp.chk('limpeza', 'apagar a cobrança apaga os chamados dela', $q$select count(*)::text from public.payment_support_tickets where company_id = (select c1 from ctx)$q$, 'OK=0');

do $result$
declare v jsonb;
begin
  select jsonb_build_object('total', count(*), 'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)) into v from r;
  raise exception 'RESULT: %', v::text;
end $result$;
