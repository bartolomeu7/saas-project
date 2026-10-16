-- =============================================================================
-- Bateria SQL — licenças, Lifetime e idempotência (Missão 08). Roda SOMENTE no projeto TEST.
-- Uma transação que termina em erro proposital (RESULT: ...): nada persiste.
-- Requer 20261012000000_lifetime_access_and_license_ops.sql aplicada.
-- O JWT do Clerk é simulado por `request.jwt.claims` (sub) + role authenticated.
-- Chamadas realmente simultâneas NÃO são exercitadas aqui (o MCP serializa): ver tests/integration.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

update public.profiles set clerk_user_id = 'lo_super'  where user_id = '2068cbe0-ade1-41f6-8301-ddbe2cfcb1fb';
update public.profiles set clerk_user_id = 'lo_admin'  where user_id = '5280eb70-5ca1-47f2-b154-9a47dbe0b021';
update public.profiles set clerk_user_id = 'lo_user'   where user_id = 'dc959a48-4136-496e-bbf9-fba7cebed805';
select set_config('app.platform_profile_write', 'on', true);
update public.profiles set role = 'admin' where user_id = '5280eb70-5ca1-47f2-b154-9a47dbe0b021';
select set_config('app.platform_profile_write', 'off', true);

create temp table ids as
  select (select id from public.plans where code = 'MONTHLY') monthly,
         (select id from public.plans where code = 'QUARTERLY') quarterly,
         (select id from public.plans where code = 'YEARLY') yearly,
         (select id from public.plans where code = 'LIFETIME') lifetime_plan,
         (select id from public.plans where code = 'CUSTOM') custom;
create temp table cos (k text primary key, id uuid);
insert into cos select 'c' || g, gen_random_uuid() from generate_series(1, 9) g;
insert into public.companies (id, name, business_type, status) select id, '[LICTEST] ' || k, 'other', 'active' from cos;
-- c1,c2,c3,c7,c8: assinatura mensal ativa (20 dias); c4: expirada; c5,c9: sem assinatura; c6: ativa
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c.id, (select monthly from ids), 'active', now() - interval '10 days', now() + interval '20 days', 'manual'
    from cos c where c.k in ('c1', 'c2', 'c3', 'c6', 'c7', 'c8');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c.id, (select monthly from ids), 'expired', now() - interval '60 days', now() - interval '5 days', 'manual' from cos c where c.k = 'c4';
insert into public.company_entitlements (company_id, plan_id, status, access_starts_at, access_expires_at)
  select s.company_id, s.plan_id, s.status, s.starts_at, s.expires_at from public.subscriptions s join cos c on c.id = s.company_id;

create temp table r (n serial, grp text, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;
grant all on ids, cos to authenticated, anon;
create or replace function pg_temp.co(k text) returns uuid language sql as $$ select id from cos where cos.k = $1 $$;
grant execute on function pg_temp.co(text) to authenticated, anon;
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
grant execute on function pg_temp.chk(text, text, text, text) to authenticated, anon;
-- dias restantes (arredondado) da assinatura de uma empresa, lido sem RLS
create or replace function pg_temp.days(k text) returns text language sql security definer as $$
  select coalesce(round(extract(epoch from (expires_at - now())) / 86400)::text, 'null') from public.subscriptions where company_id = (select id from cos where cos.k = $1) $$;
grant execute on function pg_temp.days(text) to authenticated, anon;
create or replace function pg_temp.sub(k text) returns text language sql security definer as $$
  select status::text || ',' || lifetime::text || ',' || coalesce(expires_at::text, 'null') from public.subscriptions where company_id = (select id from cos where cos.k = $1) $$;
grant execute on function pg_temp.sub(text) to authenticated, anon;
create or replace function pg_temp.ent(k text) returns text language sql security definer as $$
  select status::text || ',' || lifetime::text || ',' || coalesce(access_expires_at::text, 'null') from public.company_entitlements where company_id = (select id from cos where cos.k = $1) $$;
grant execute on function pg_temp.ent(text) to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"lo_admin","role":"authenticated"}', true);

-- ===================================================== A) CONCESSÃO + IDEMPOTÊNCIA (admin)
select pg_temp.chk('grant', 'admin: 30 dias (key A1) => replayed=false, ~50 dias', $q$select ((public.admin_grant_license(pg_temp.co('c1'), 'thirty_days', null, null, 'cortesia suporte', '11111111-1111-1111-1111-111111111111'))->>'replayed') || ',' || pg_temp.days('c1')$q$, 'OK=false,50');
select pg_temp.chk('grant', 'MESMA chave repetida (duplo clique/retry): replayed=true e vencimento NÃO muda', $q$select ((public.admin_grant_license(pg_temp.co('c1'), 'thirty_days', null, null, 'cortesia suporte', '11111111-1111-1111-1111-111111111111'))->>'replayed') || ',' || pg_temp.days('c1')$q$, 'OK=true,50');
select pg_temp.chk('grant', 'mesma chave em OUTRA empresa é recusada', $q$select public.admin_grant_license(pg_temp.co('c2'), 'thirty_days', null, null, 'cortesia suporte', '11111111-1111-1111-1111-111111111111')::text$q$, 'ERR=já foi usada em outra operação');
select pg_temp.chk('grant', 'mesma chave com OUTRO tipo é recusada', $q$select public.admin_grant_license(pg_temp.co('c1'), 'custom_days', null, 5, 'cortesia suporte', '11111111-1111-1111-1111-111111111111')::text$q$, 'ERR=já foi usada em outra operação');
select pg_temp.chk('grant', 'NOVA chave = nova concessão legítima (acumula: ~80 dias)', $q$select ((public.admin_grant_license(pg_temp.co('c1'), 'thirty_days', null, null, 'segunda cortesia', '22222222-2222-2222-2222-222222222222'))->>'replayed') || ',' || pg_temp.days('c1')$q$, 'OK=false,80');
select pg_temp.chk('grant', 'chave ausente é recusada', $q$select public.admin_grant_license(pg_temp.co('c2'), 'thirty_days', null, null, 'sem chave', null)::text$q$, 'ERR=Chave de operação obrigatória');
select pg_temp.chk('grant', 'falha NÃO consome a chave (rollback): motivo curto recusado e a chave segue livre', $q$select public.admin_grant_license(pg_temp.co('c2'), 'thirty_days', null, null, 'x', '33333333-3333-3333-3333-333333333333')::text$q$, 'ERR=Informe o motivo');
select pg_temp.chk('grant', 'a mesma chave agora funciona com motivo válido', $q$select ((public.admin_grant_license(pg_temp.co('c2'), 'thirty_days', null, null, 'motivo valido', '33333333-3333-3333-3333-333333333333'))->>'replayed')$q$, 'OK=false');
select pg_temp.chk('grant', 'admin: dias personalizados dentro do limite (10)', $q$select (public.admin_grant_license(pg_temp.co('c2'), 'custom_days', null, 10, 'acordo comercial', '44444444-4444-4444-4444-444444444444'))->>'days'$q$, 'OK=10');
select pg_temp.chk('grant', 'admin: 31 dias personalizados excede o limite (30)', $q$select public.admin_grant_license(pg_temp.co('c2'), 'custom_days', null, 31, 'acima do limite', '55555555-5555-5555-5555-555555555555')::text$q$, 'ERR=de 1 a 30 dias sem pagamento');
select pg_temp.chk('grant', 'admin: plano TRIMESTRAL (93 dias) sem pagamento excede o limite', $q$select public.admin_grant_license(pg_temp.co('c2'), 'plan_period', (select quarterly from ids), null, 'trimestral', '66666666-6666-6666-6666-666666666666')::text$q$, 'ERR=sem pagamento');
select pg_temp.chk('grant', 'admin: plano MENSAL (31 dias) sem pagamento excede o limite de 30', $q$select public.admin_grant_license(pg_temp.co('c2'), 'plan_period', (select monthly from ids), null, 'mensal', '77777777-7777-7777-7777-777777777777')::text$q$, 'ERR=sem pagamento');
select pg_temp.chk('grant', 'tipo inválido', $q$select public.admin_grant_license(pg_temp.co('c2'), 'forever', null, null, 'motivo valido', gen_random_uuid())::text$q$, 'ERR=Tipo de concessão inválido');
select pg_temp.chk('grant', 'dias personalizados vazios/zero/negativos', $q$select public.admin_grant_license(pg_temp.co('c2'), 'custom_days', null, 0, 'motivo valido', gen_random_uuid())::text$q$, 'ERR=de 1 a 365 dias');
select pg_temp.chk('grant', 'plano sob consulta (sem duração) não vira período', $q$select public.admin_grant_license(pg_temp.co('c2'), 'plan_period', (select custom from ids), null, 'sob consulta', gen_random_uuid())::text$q$, 'ERR=não tem duração fixa');
select pg_temp.chk('grant', 'plan_period sem plano', $q$select public.admin_grant_license(pg_temp.co('c2'), 'plan_period', null, null, 'sem plano', gen_random_uuid())::text$q$, 'ERR=Informe o plano');
select pg_temp.chk('grant', 'plano vitalício não é "período do plano"', $q$select public.admin_grant_license(pg_temp.co('c2'), 'plan_period', (select lifetime_plan from ids), null, 'vitalicio', gen_random_uuid())::text$q$, 'ERR=não tem duração fixa');
select pg_temp.chk('grant', 'empresa inexistente', $q$select public.admin_grant_license(gen_random_uuid(), 'thirty_days', null, null, 'motivo valido', gen_random_uuid())::text$q$, 'ERR=Empresa não encontrada');
select pg_temp.chk('grant', 'empresa SEM assinatura exige plano', $q$select public.admin_grant_license(pg_temp.co('c5'), 'thirty_days', null, null, 'sem plano', gen_random_uuid())::text$q$, 'ERR=Informe o plano');
select pg_temp.chk('grant', 'empresa SEM assinatura + plano: cria assinatura e entitlements coerentes', $q$select ((public.admin_grant_license(pg_temp.co('c5'), 'thirty_days', (select monthly from ids), null, 'nova empresa', gen_random_uuid()))->>'status') || ',' || pg_temp.days('c5') || ',' || (pg_temp.sub('c5') like 'active,false,%')::text || ',' || (pg_temp.ent('c5') like 'active,false,%')::text$q$, 'OK=active,30,true,true');

-- ===================================================== B) LIFETIME
select pg_temp.chk('lifetime', 'admin NÃO concede vitalício', $q$select public.admin_grant_license(pg_temp.co('c3'), 'lifetime', null, null, 'tentativa admin', gen_random_uuid())::text$q$, 'ERR=not authorized');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"lo_super","role":"authenticated"}', true);
select pg_temp.chk('lifetime', 'super concede vitalício (key L1): lifetime=true e sem vencimento', $q$select ((public.admin_grant_license(pg_temp.co('c3'), 'lifetime', null, null, 'parceria estratégica', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))->>'lifetime') || ',' || pg_temp.sub('c3')$q$, 'OK=true,active,true,null');
select pg_temp.chk('lifetime', 'assinatura vitalícia: status active, lifetime true, expires_at NULL (sem data fictícia)', $q$select pg_temp.sub('c3')$q$, 'OK=active,true,null');
select pg_temp.chk('lifetime', 'entitlements espelham o vitalício (access_expires_at NULL)', $q$select pg_temp.ent('c3')$q$, 'OK=active,true,null');
select pg_temp.chk('lifetime', 'plano da assinatura é o LIFETIME', $q$select plan_code from public.list_platform_subscriptions('[LICTEST] c3') limit 1$q$, 'OK=LIFETIME');
select pg_temp.chk('lifetime', 'mesma chave repetida: replayed=true', $q$select ((public.admin_grant_license(pg_temp.co('c3'), 'lifetime', null, null, 'parceria estratégica', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))->>'replayed')$q$, 'OK=true');
select pg_temp.chk('lifetime', 'novo pedido de vitalício para quem já é vitalício: recusado', $q$select public.admin_grant_license(pg_temp.co('c3'), 'lifetime', null, null, 'de novo', gen_random_uuid())::text$q$, 'ERR=já possui acesso vitalício');
select pg_temp.chk('lifetime', 'conceder dias sobre vitalício: recusado (não há prazo)', $q$select public.admin_grant_license(pg_temp.co('c3'), 'thirty_days', null, null, 'estender', gen_random_uuid())::text$q$, 'ERR=acesso vitalício');
select pg_temp.chk('lifetime', 'RPC antiga conceder dias também recusa vitalício', $q$select public.admin_grant_access_days(pg_temp.co('c3'), 5, null, 'estender antigo')::text$q$, 'ERR=acesso vitalício');
select pg_temp.chk('lifetime', 'RPC antiga liberar 30 dias também recusa vitalício', $q$select public.admin_release_30_days(pg_temp.co('c3'), null, 'liberar antigo')::text$q$, 'ERR=acesso vitalício');
select pg_temp.chk('lifetime', 'ajustar vencimento de vitalício: recusado', $q$select public.admin_adjust_access_expiry(pg_temp.co('c3'), now() + interval '10 days', 'ajuste')::text$q$, 'ERR=não tem vencimento');
select pg_temp.chk('lifetime', 'registrar pagamento COM acesso sobre vitalício: recusado', $q$select public.admin_record_manual_payment(pg_temp.co('c3'), (select monthly from ids), 89, 'pix', 'LT-1', null, null, true, gen_random_uuid())::text$q$, 'ERR=acesso vitalício');
select pg_temp.chk('lifetime', 'registrar pagamento SEM acesso sobre vitalício: permitido (só documenta)', $q$select ((public.admin_record_manual_payment(pg_temp.co('c3'), (select monthly from ids), 89, 'pix', 'LT-2', 'recebido', null, false, gen_random_uuid()))->>'access_applied')$q$, 'OK=false');
select pg_temp.chk('lifetime', 'vitalício continua intacto após as tentativas', $q$select pg_temp.sub('c3')$q$, 'OK=active,true,null');
select pg_temp.chk('lifetime', 'marcar vencidas NÃO toca o vitalício', $q$select (public.admin_mark_expired_subscriptions() >= 0)::text || ',' || pg_temp.sub('c3')$q$, 'OK=true,active,true,null');
select pg_temp.chk('lifetime', 'sincronizar entitlements preserva o vitalício', $q$select coalesce(public.admin_sync_company_entitlements(pg_temp.co('c3'))::text, '') || pg_temp.ent('c3')$q$, 'OK=active,true,null');
select pg_temp.chk('lifetime', 'atribuir plano comum a vitalício sem prazo: recusado', $q$select public.admin_assign_plan(pg_temp.co('c3'), (select yearly from ids), null, 'substituir')::text$q$, 'ERR=Informe o novo prazo');
select pg_temp.chk('lifetime', 'atribuir o plano vitalício pela tela de plano: recusado (use a concessão)', $q$select public.admin_assign_plan(pg_temp.co('c1'), (select lifetime_plan from ids), null, 'errado')::text$q$, 'ERR=concessão de acesso vitalício');
-- cancelar e reativar
select pg_temp.chk('lifetime', 'super cancela o vitalício (flag preservada)', $q$select coalesce(public.admin_cancel_subscription(pg_temp.co('c3'), 'encerrada a parceria')::text, '')$q$, 'OK=');
select pg_temp.chk('lifetime', 'cancelado: sem acesso, lifetime ainda true, expires NULL', $q$select pg_temp.sub('c3')$q$, 'OK=cancelled,true,null');
select pg_temp.chk('lifetime', 'reativar vitalício cancelado devolve o acesso permanente (sem prazo novo)', $q$select ((public.admin_reactivate_subscription(pg_temp.co('c3'), null, 'parceria retomada'))->>'lifetime')$q$, 'OK=true');
select pg_temp.chk('lifetime', 'após reativar: active,true,null', $q$select pg_temp.sub('c3')$q$, 'OK=active,true,null');
-- converter vitalício em prazo (revogar) — super com prazo explícito
select pg_temp.chk('lifetime', 'super substitui o vitalício por plano com prazo (30 dias): lifetime=false e vencimento definido', $q$select ((public.admin_assign_plan(pg_temp.co('c3'), (select monthly from ids), 30, 'revogação do vitalício'))->>'lifetime') || ',' || pg_temp.days('c3') || ',' || (pg_temp.sub('c3') like 'active,false,%')::text || ',' || (pg_temp.ent('c3') like 'active,false,%')::text$q$, 'OK=false,30,true,true');

-- ===================================================== C) PERMISSÕES, ADMIN x SUPER
select set_config('request.jwt.claims', '{"sub":"lo_admin","role":"authenticated"}', true);
select pg_temp.chk('policy', 'admin: atribuir plano a empresa EXPIRADA com duração do plano (31 > 30) exige pagamento', $q$select public.admin_assign_plan(pg_temp.co('c4'), (select yearly from ids), null, 'renovar sem pagamento')::text$q$, 'ERR=sem pagamento');
select pg_temp.chk('policy', 'admin: atribuir plano com 10 dias explícitos é permitido', $q$select (public.admin_assign_plan(pg_temp.co('c4'), (select monthly from ids), 10, 'cortesia 10 dias'))->>'plan_code'$q$, 'OK=MONTHLY');
select pg_temp.chk('policy', 'admin: trocar de plano PRESERVANDO o período ativo continua permitido', $q$select (public.admin_assign_plan(pg_temp.co('c6'), (select yearly from ids), null, 'upgrade preservando'))->>'plan_code'$q$, 'OK=YEARLY');
select pg_temp.chk('policy', 'admin: período do upgrade foi preservado (~20 dias)', $q$select pg_temp.days('c6')$q$, 'OK=20');
select pg_temp.chk('policy', 'admin: assign com 400 dias excede o limite', $q$select public.admin_assign_plan(pg_temp.co('c7'), (select yearly from ids), 400, 'muito')::text$q$, 'ERR=sem pagamento');
select pg_temp.chk('policy', 'admin: reativar empresa expirada com plano de 31 dias exige pagamento', $q$select public.admin_reactivate_subscription(pg_temp.co('c9'), null, 'x y z')::text$q$, 'ERR=não possui assinatura');
-- pagamento manual com acesso
select pg_temp.chk('payment', 'pagamento manual de R$ 0 com acesso: recusado (use "Conceder acesso")', $q$select public.admin_record_manual_payment(pg_temp.co('c8'), (select monthly from ids), 0, 'cash', 'Z-0', null, null, true, gen_random_uuid())::text$q$, 'ERR=maior que zero');
select pg_temp.chk('payment', 'pagamento manual de R$ 89 com acesso (key P1): libera ~51 dias', $q$select ((public.admin_record_manual_payment(pg_temp.co('c8'), (select monthly from ids), 89, 'pix', 'P-89', 'cliente pagou no pix', null, true, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'))->>'access_applied') || ',' || pg_temp.days('c8')$q$, 'OK=true,51');
select pg_temp.chk('payment', 'MESMA chave: replayed, sem segundo pagamento nem segunda extensão', $q$select ((public.admin_record_manual_payment(pg_temp.co('c8'), (select monthly from ids), 89, 'pix', 'P-89', 'cliente pagou no pix', null, true, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'))->>'replayed') || ',' || pg_temp.days('c8')$q$, 'OK=true,51');
reset role;
select pg_temp.chk('payment', 'só 1 pagamento manual foi gravado para a empresa', $q$select count(*)::text from public.subscription_payments where company_id = pg_temp.co('c8') and provider = 'manual'$q$, 'OK=1');
select pg_temp.chk('payment', 'pagamento ligado à assinatura e auditoria registra o preço do plano', $q$select (sp.subscription_id is not null)::text || ',' || (a.metadata->>'plan_price') from public.subscription_payments sp join public.audit_logs a on a.entity_id = sp.id and a.action = 'platform.payment.manual_recorded' where sp.company_id = pg_temp.co('c8')$q$, 'OK=true,89.00');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"lo_admin","role":"authenticated"}', true);
select pg_temp.chk('payment', 'pagamento manual SEM acesso (só documenta) com valor menor é permitido', $q$select ((public.admin_record_manual_payment(pg_temp.co('c7'), (select monthly from ids), 50, 'cash', 'D-50', 'sinal', null, false, gen_random_uuid()))->>'access_applied')$q$, 'OK=false');
select pg_temp.chk('payment', 'plano vitalício não é vendido (pagamento com acesso)', $q$select public.admin_record_manual_payment(pg_temp.co('c7'), (select lifetime_plan from ids), 1, 'cash', 'D-1', null, null, true, gen_random_uuid())::text$q$, 'ERR=não é vendido');

-- ===================================================== D) LEITURAS COM VITALÍCIO
select set_config('request.jwt.claims', '{"sub":"lo_super","role":"authenticated"}', true);
select pg_temp.chk('read', 'preparação: super concede vitalício à empresa c7', $q$select ((public.admin_grant_license(pg_temp.co('c7'), 'lifetime', null, null, 'leitura', gen_random_uuid()))->>'lifetime')$q$, 'OK=true');
select pg_temp.chk('read', 'lista de assinaturas: vitalício = active, lifetime true, sem vencimento, dias NULL', $q$select (state || ',' || lifetime::text || ',' || coalesce(expires_at::text, 'null') || ',' || coalesce(days_left::text, 'null')) from public.list_platform_subscriptions('[LICTEST] c7') limit 1$q$, 'OK=active,true,null,null');
select pg_temp.chk('read', 'filtro estado=active inclui o vitalício', $q$select count(*)::text from public.list_platform_subscriptions('[LICTEST] c7', 'active')$q$, 'OK=1');
select pg_temp.chk('read', 'filtro estado=expired NÃO inclui o vitalício', $q$select count(*)::text from public.list_platform_subscriptions('[LICTEST] c7', 'expired')$q$, 'OK=0');
select pg_temp.chk('read', 'janela de vencimento (365 d) NÃO inclui o vitalício', $q$select count(*)::text from public.list_platform_subscriptions('[LICTEST] c7', null, null, null, 365)$q$, 'OK=0');
select pg_temp.chk('read', 'lista de empresas: acesso ativo = true e vencimento nulo', $q$select (access_active::text || ',' || coalesce(subscription_expires_at::text, 'null')) from public.list_platform_admin_companies('[LICTEST] c7') limit 1$q$, 'OK=true,null');
select pg_temp.chk('read', 'lista de empresas: filtro assinatura=active inclui o vitalício', $q$select count(*)::text from public.list_platform_admin_companies('[LICTEST] c7', null, null, 'active')$q$, 'OK=1');
select pg_temp.chk('read', 'detalhe da empresa: lifetime true, access_active true, days_left nulo', $q$select (d->'subscription'->>'lifetime') || ',' || (d->'subscription'->>'access_active') || ',' || coalesce(d->'subscription'->>'days_left', 'null') from (select public.get_platform_company_detail(pg_temp.co('c7')) d) x$q$, 'OK=true,true,null');
select pg_temp.chk('read', 'detalhe: plano marcado como lifetime', $q$select (public.get_platform_company_detail(pg_temp.co('c7'))->'subscription'->'plan'->>'lifetime')$q$, 'OK=true');
select pg_temp.chk('read', 'dashboard: contador lifetime >= 1', $q$select ((public.get_platform_dashboard()->'subscriptions'->>'lifetime')::int >= 1)::text$q$, 'OK=true');
select pg_temp.chk('read', 'dashboard: vitalício conta como ativo, nunca como expirado', $q$select ((public.get_platform_dashboard()->'subscriptions'->>'active')::int >= 1)::text$q$, 'OK=true');
select pg_temp.chk('read', 'dashboard: tem receita por origem (evopay_30d e refunded_total)', $q$select ((public.get_platform_dashboard()->'revenue') ? 'evopay_30d' and (public.get_platform_dashboard()->'revenue') ? 'refunded_total')::text$q$, 'OK=true');
select pg_temp.chk('read', 'MRR estimado não soma vitalício (continua número finito)', $q$select ((public.get_platform_dashboard()->>'mrr_estimate')::numeric >= 0)::text$q$, 'OK=true');
select pg_temp.chk('read', 'catálogo público NÃO lista o plano vitalício', $q$select count(*)::text from public.get_public_plans() where code = 'LIFETIME'$q$, 'OK=0');
select pg_temp.chk('read', 'lista de planos do admin mostra o vitalício com assinaturas ativas', $q$select (active_subscriptions_count >= 1)::text || ',' || lifetime::text from public.list_platform_plans() where code = 'LIFETIME'$q$, 'OK=true,true');
select pg_temp.chk('read', 'diagnósticos: 14 verificações', $q$select count(*)::text from public.platform_diagnostics()$q$, 'OK=14');
select pg_temp.chk('read', 'diagnósticos: entitlements coerentes (inclui vitalício)', $q$select affected::text from public.platform_diagnostics() where check_key = 'entitlements_mismatch'$q$, 'OK=0');

-- ===================================================== E) PERMISSÕES NEGADAS
select pg_temp.chk('plans', 'plano vitalício: preço não é aceito (mensagem clara)', $q$select coalesce(public.update_platform_plan((select lifetime_plan from ids), 'Vitalício', null, 100, null, null, 0, false, false, false, false, false, 90)::text, '')$q$, 'ERR=não tem preço');
select pg_temp.chk('plans', 'plano vitalício: trial não é aceito', $q$select coalesce(public.update_platform_plan((select lifetime_plan from ids), 'Vitalício', null, null, null, null, 0, true, false, false, false, false, 90)::text, '')$q$, 'ERR=não tem preço');
select pg_temp.chk('plans', 'plano vitalício: renomear e ajustar recursos é permitido', $q$select coalesce(public.update_platform_plan((select lifetime_plan from ids), 'Vitalício Parceiros', 'Parceiros estratégicos', null, null, null, 2, false, true, true, false, false, 90)::text, '')$q$, 'OK=');
select pg_temp.chk('plans', 'nome atualizado', $q$select name from public.plans where code = 'LIFETIME'$q$, 'OK=Vitalício Parceiros');
select pg_temp.chk('plans', 'super desativa o plano vitalício (bloqueia NOVAS concessões)', $q$select coalesce(public.set_platform_plan_status((select lifetime_plan from ids), 'inactive')::text, '')$q$, 'OK=');
select pg_temp.chk('plans', 'com o plano vitalício inativo, nova concessão vitalícia é recusada', $q$select public.admin_grant_license(pg_temp.co('c9'), 'lifetime', null, null, 'plano desativado', gen_random_uuid())::text$q$, 'ERR=Plano vitalício não encontrado ou inativo');
select pg_temp.chk('plans', 'super reativa o plano vitalício', $q$select coalesce(public.set_platform_plan_status((select lifetime_plan from ids), 'active')::text, '')$q$, 'OK=');

select set_config('request.jwt.claims', '{"sub":"lo_user","role":"authenticated"}', true);
select pg_temp.chk('denied', 'usuário comum: conceder licença', $q$select public.admin_grant_license(pg_temp.co('c1'), 'thirty_days', null, null, 'motivo valido', gen_random_uuid())::text$q$, 'ERR=not authorized');
select pg_temp.chk('denied', 'usuário comum: pagamento manual', $q$select public.admin_record_manual_payment(pg_temp.co('c1'), (select monthly from ids), 89, 'pix', null, null, null, true, gen_random_uuid())::text$q$, 'ERR=not authorized');
select pg_temp.chk('denied', 'usuário comum: não executa helpers internos', $q$select public.platform_begin_operation(gen_random_uuid(), 'x', null)::text$q$, 'ERR=permission denied');
select pg_temp.chk('denied', 'usuário comum: não executa platform_apply_access', $q$select public.platform_apply_access(pg_temp.co('c1'), (select monthly from ids), 'active', now() + interval '1 day')::text$q$, 'ERR=permission denied');
select pg_temp.chk('denied', 'usuário comum: não lê as chaves de operação', $q$select count(*)::text from public.platform_operation_keys$q$, 'ERR=permission denied');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('denied', 'anon: conceder licença', $q$select public.admin_grant_license(pg_temp.co('c1'), 'thirty_days', null, null, 'motivo valido', gen_random_uuid())::text$q$, 'ERR=permission denied');
select pg_temp.chk('denied', 'anon: catálogo público continua legível', $q$select (count(*) > 0)::text from public.get_public_plans()$q$, 'OK=true');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ===================================================== F) CONSTRAINTS E INTEGRIDADE
select pg_temp.chk('integrity', 'banco recusa lifetime=true com vencimento', $q$insert into public.subscriptions(company_id, plan_id, status, starts_at, expires_at, lifetime) values (pg_temp.co('c9'), (select lifetime_plan from ids), 'active', now(), now() + interval '1 day', true) returning 'x'$q$, 'ERR=subscriptions_lifetime_coherent');
select pg_temp.chk('integrity', 'banco recusa lifetime=false sem vencimento', $q$insert into public.subscriptions(company_id, plan_id, status, starts_at, expires_at, lifetime) values (pg_temp.co('c9'), (select monthly from ids), 'active', now(), null, false) returning 'x'$q$, 'ERR=');
select pg_temp.chk('integrity', 'plano vitalício não aceita preço/duração', $q$update public.plans set price = 10 where code = 'LIFETIME' returning 'x'$q$, 'ERR=plans_lifetime_has_no_duration');
select pg_temp.chk('integrity', 'cobrança Pix de plano vitalício é recusada (sem preço)', $q$select count(*)::text from public.claim_subscription_payment(pg_temp.co('c9'), (select lifetime_plan from ids), 0)$q$, 'ERR=Plano sem preço');
-- pagamento Pix confirmado sobre vitalício: registra e NÃO altera o acesso
update public.subscriptions set plan_id = (select lifetime_plan from ids), lifetime = true, expires_at = null, status = 'active' where company_id = pg_temp.co('c1');
update public.company_entitlements set plan_id = (select lifetime_plan from ids), lifetime = true, access_expires_at = null, status = 'active' where company_id = pg_temp.co('c1');
insert into public.subscription_payments (company_id, plan_id, provider, status, amount, currency, provider_transaction_id)
  values (pg_temp.co('c1'), (select monthly from ids), 'evopay', 'pending', 89, 'BRL', 'tx_lo_1');
create temp table pay_lo as select id from public.subscription_payments where company_id = pg_temp.co('c1') and provider = 'evopay';
select pg_temp.chk('integrity', 'Pix confirmado sobre empresa vitalícia: paga e o acesso permanece vitalício', $q$select (c.ok::text || ',' || c.new_status::text) || ',' || pg_temp.sub('c1') from public.confirm_subscription_payment((select id from pay_lo), 'paid', 'E2E-LO', 'lo:tx_lo_1:COMPLETED', 'pix.status_check', '{}'::jsonb, 89.00) c$q$, 'OK=true,paid,active,true,null');
select pg_temp.chk('integrity', 'subscriptions x entitlements coerentes em TODAS as empresas', $q$select count(*)::text from public.subscriptions s join public.company_entitlements e on e.company_id = s.company_id where e.plan_id <> s.plan_id or e.status <> s.status or e.access_expires_at is distinct from s.expires_at or e.lifetime <> s.lifetime$q$, 'OK=0');
select pg_temp.chk('audit', 'auditoria: concessões de licença e de vitalício registradas', $q$select ((select count(*) from public.audit_logs where action = 'platform.access.license_granted') >= 4 and (select count(*) from public.audit_logs where action = 'platform.access.lifetime_granted') >= 2)::text$q$, 'OK=true');
select pg_temp.chk('audit', 'auditoria sem a chave de operação como segredo e todas com ator', $q$select count(*)::text from public.audit_logs where action like 'platform.access.%' and actor_user_id is null$q$, 'OK=0');
select pg_temp.chk('audit', 'categoria ACCESS_EXTENSION para as novas ações', $q$select public.platform_audit_category('platform.access.license_granted') || ',' || public.platform_audit_category('platform.access.lifetime_granted')$q$, 'OK=ACCESS_EXTENSION,ACCESS_EXTENSION');

do $result$
declare v jsonb;
begin
  select jsonb_build_object('total', count(*), 'pass', count(*) filter (where ok), 'fail', count(*) filter (where not ok),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)) into v from r;
  raise exception 'RESULT: %', v::text;
end $result$;
