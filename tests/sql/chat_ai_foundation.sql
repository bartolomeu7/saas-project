-- =============================================================================
-- Bateria SQL — Chat AI, fundação (20261111200000_chat_ai_foundation).
-- Roda SOMENTE no projeto TEST. Transação que termina em erro proposital (RESULT: ...): nada persiste.
-- =============================================================================
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('ffffffff-0000-0000-0000-0000000000c1', 'ch_owner', 'CH Dono', 'ch-owner@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-0000000000c2', 'ch_admin', 'CH Admin', 'ch-admin@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-0000000000c3', 'ch_emp', 'CH Funcionario', 'ch-emp@example.invalid', 'user', 'active'),
  ('ffffffff-0000-0000-0000-0000000000c4', 'ch_other', 'CH Outro Dono', 'ch-other@example.invalid', 'user', 'active');
insert into public.companies (id, name, business_type, status) values
  ('ffffffff-1000-0000-0000-0000000000c1', '[CHTEST] Empresa', 'bakery', 'active'),
  ('ffffffff-1000-0000-0000-0000000000c4', '[CHTEST] Outra', 'bakery', 'active');
alter table public.company_members disable trigger company_members_seat_limit;
insert into public.company_members (company_id, user_id, role) values
  ('ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c1', 'owner'),
  ('ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c2', 'admin'),
  ('ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c3', 'employee'),
  ('ffffffff-1000-0000-0000-0000000000c4', 'ffffffff-0000-0000-0000-0000000000c4', 'owner');
insert into public.subscriptions (company_id, plan_id, status, starts_at, expires_at, provider)
  select c, (select id from public.plans order by created_at limit 1), 'active', now(), now() + interval '30 days', 'manual'
  from (values ('ffffffff-1000-0000-0000-0000000000c1'::uuid), ('ffffffff-1000-0000-0000-0000000000c4'::uuid)) v(c);

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

-- Dados como o servidor faria (service_role): sessões, rascunhos e mensagens do dono, do funcionário e da empresa B.
insert into public.chat_sessions (id, company_id, user_id) values
  ('ffffffff-5000-0000-0000-0000000000c1', 'ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c1'),
  ('ffffffff-5000-0000-0000-0000000000c2', 'ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c3'),
  ('ffffffff-5000-0000-0000-0000000000c9', 'ffffffff-1000-0000-0000-0000000000c4', 'ffffffff-0000-0000-0000-0000000000c4');
insert into public.chat_drafts (id, company_id, user_id, session_id, module, intent, risk, status, expires_at, idempotency_key) values
  ('ffffffff-6000-0000-0000-0000000000c1', 'ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c1', 'ffffffff-5000-0000-0000-0000000000c1', 'agenda', 'agenda.agendar', 'R1', 'aguardando_confirmacao', now() + interval '30 minutes', 'k1'),
  ('ffffffff-6000-0000-0000-0000000000c2', 'ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c3', 'ffffffff-5000-0000-0000-0000000000c2', 'agenda', 'agenda.agendar', 'R1', 'coletando', now() + interval '30 minutes', 'k2'),
  ('ffffffff-6000-0000-0000-0000000000c9', 'ffffffff-1000-0000-0000-0000000000c4', 'ffffffff-0000-0000-0000-0000000000c4', 'ffffffff-5000-0000-0000-0000000000c9', 'agenda', 'agenda.agendar', 'R1', 'coletando', now() + interval '30 minutes', 'k9');
insert into public.chat_messages (session_id, company_id, user_id, role, text) values
  ('ffffffff-5000-0000-0000-0000000000c1', 'ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c1', 'user', 'oi'),
  ('ffffffff-5000-0000-0000-0000000000c2', 'ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c3', 'user', 'mensagem do funcionario'),
  ('ffffffff-5000-0000-0000-0000000000c9', 'ffffffff-1000-0000-0000-0000000000c4', 'ffffffff-0000-0000-0000-0000000000c4', 'user', 'mensagem da outra empresa');
insert into public.chat_usage (company_id, day, messages) values ('ffffffff-1000-0000-0000-0000000000c1', current_date, 5);
insert into public.chat_feedback (company_id, intent, kind) values ('ffffffff-1000-0000-0000-0000000000c1', 'agenda.agendar', 'confirmado');

-- ================================================= ISOLAMENTO DE LEITURA
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ch_owner","role":"authenticated"}', true);
select pg_temp.chk('leitura', 'dono vê só as PRÓPRIAS mensagens (1), não as do funcionário nem de outra empresa', $q$select count(*)::text from public.chat_messages$q$, 'OK=1');
select pg_temp.chk('leitura', 'dono vê só o próprio rascunho (1)', $q$select count(*)::text from public.chat_drafts$q$, 'OK=1');
select pg_temp.chk('leitura', 'dono vê só a própria sessão (1)', $q$select count(*)::text from public.chat_sessions$q$, 'OK=1');
select pg_temp.chk('leitura', 'dono (gestor) lê o uso da empresa (1)', $q$select count(*)::text from public.chat_usage$q$, 'OK=1');
select pg_temp.chk('leitura', 'dono (gestor) lê o feedback da empresa (1)', $q$select count(*)::text from public.chat_feedback$q$, 'OK=1');

select set_config('request.jwt.claims', '{"sub":"ch_emp","role":"authenticated"}', true);
select pg_temp.chk('leitura', 'funcionário vê só as próprias mensagens (1)', $q$select count(*)::text from public.chat_messages$q$, 'OK=1');
select pg_temp.chk('leitura', 'funcionário NÃO vê rascunho do dono', $q$select count(*)::text from public.chat_drafts where id = 'ffffffff-6000-0000-0000-0000000000c1'$q$, 'OK=0');
select pg_temp.chk('leitura', 'funcionário NÃO lê uso da empresa', $q$select count(*)::text from public.chat_usage$q$, 'OK=0');
select pg_temp.chk('leitura', 'funcionário NÃO lê feedback', $q$select count(*)::text from public.chat_feedback$q$, 'OK=0');

select set_config('request.jwt.claims', '{"sub":"ch_other","role":"authenticated"}', true);
select pg_temp.chk('leitura', 'outra empresa vê só o dela (1 mensagem)', $q$select count(*)::text from public.chat_messages$q$, 'OK=1');
select pg_temp.chk('leitura', 'outra empresa NÃO vê rascunho da empresa A', $q$select count(*)::text from public.chat_drafts where company_id = 'ffffffff-1000-0000-0000-0000000000c1'$q$, 'OK=0');

-- ================================================= ESCRITA: authenticated não escreve nas tabelas de conversa
select set_config('request.jwt.claims', '{"sub":"ch_owner","role":"authenticated"}', true);
select pg_temp.chk('escrita', 'authenticated NÃO insere rascunho (não dá para forjar um rascunho pronto)',
  $q$insert into public.chat_drafts (company_id, user_id, session_id, module, intent, risk, status, expires_at) values ('ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c1', 'ffffffff-5000-0000-0000-0000000000c1', 'agenda', 'agenda.agendar', 'R1', 'aguardando_confirmacao', now() + interval '1 hour')$q$, 'ERR=permission denied');
select pg_temp.chk('escrita', 'authenticated NÃO altera rascunho', $q$update public.chat_drafts set status = 'concluido' where id = 'ffffffff-6000-0000-0000-0000000000c1'$q$, 'ERR=permission denied');
select pg_temp.chk('escrita', 'authenticated NÃO apaga mensagem', $q$delete from public.chat_messages$q$, 'ERR=permission denied');
select pg_temp.chk('escrita', 'authenticated NÃO insere mensagem', $q$insert into public.chat_messages (session_id, company_id, user_id, role, text) values ('ffffffff-5000-0000-0000-0000000000c1', 'ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c1', 'user', 'x')$q$, 'ERR=permission denied');
select pg_temp.chk('escrita', 'authenticated NÃO chama a rotina de expirar', $q$select public.chat_expire_due_drafts()$q$, 'ERR=permission denied');
select pg_temp.chk('escrita', 'authenticated NÃO chama a rotina de retenção', $q$select public.chat_purge_old_messages()$q$, 'ERR=permission denied');

-- ================================================= CONFIGURAÇÃO: só o dono grava
select pg_temp.chk('config', 'dono cria a configuração da empresa', $q$insert into public.chat_settings (company_id, enabled, agent_name) values ('ffffffff-1000-0000-0000-0000000000c1', true, 'Cláudia') returning 'ok'$q$, 'OK=ok');
select pg_temp.chk('config', 'dono NÃO cria configuração de outra empresa', $q$insert into public.chat_settings (company_id) values ('ffffffff-1000-0000-0000-0000000000c4')$q$, 'ERR=row-level security');
select pg_temp.chk('config', 'nome da agente curto demais é recusado', $q$update public.chat_settings set agent_name = 'A' where company_id = 'ffffffff-1000-0000-0000-0000000000c1'$q$, 'ERR=check constraint');
select set_config('request.jwt.claims', '{"sub":"ch_admin","role":"authenticated"}', true);
select pg_temp.chk('config', 'administrador lê a configuração', $q$select count(*)::text from public.chat_settings$q$, 'OK=1');
select pg_temp.chk('config', 'administrador NÃO altera a configuração (só o dono)', $q$update public.chat_settings set agent_name = 'Outra' where company_id = 'ffffffff-1000-0000-0000-0000000000c1' returning 'x'$q$, 'OK=null');
select set_config('request.jwt.claims', '{"sub":"ch_other","role":"authenticated"}', true);
select pg_temp.chk('config', 'outra empresa NÃO lê a configuração da A', $q$select count(*)::text from public.chat_settings$q$, 'OK=0');

-- ================================================= ANÔNIMO
reset role;
set local role anon;
select pg_temp.chk('anon', 'anônimo não lê rascunhos', $q$select count(*) from public.chat_drafts$q$, 'ERR=permission denied');
select pg_temp.chk('anon', 'anônimo não lê mensagens', $q$select count(*) from public.chat_messages$q$, 'ERR=permission denied');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ================================================= REGRAS DO BANCO (service_role)
select pg_temp.chk('regras', 'status inválido é recusado', $q$update public.chat_drafts set status = 'pronto' where id = 'ffffffff-6000-0000-0000-0000000000c1'$q$, 'ERR=check constraint');
select pg_temp.chk('regras', 'risco inválido é recusado', $q$update public.chat_drafts set risk = 'R9' where id = 'ffffffff-6000-0000-0000-0000000000c1'$q$, 'ERR=check constraint');
select pg_temp.chk('regras', 'versão 0 é recusada', $q$update public.chat_drafts set version = 0 where id = 'ffffffff-6000-0000-0000-0000000000c1'$q$, 'ERR=check constraint');
select pg_temp.chk('regras', 'chave de idempotência repetida é recusada', $q$update public.chat_drafts set idempotency_key = 'k1' where id = 'ffffffff-6000-0000-0000-0000000000c2'$q$, 'ERR=duplicate key');
select pg_temp.chk('regras', 'mensagem acima de 4000 caracteres é recusada', $q$insert into public.chat_messages (session_id, company_id, user_id, role, text) values ('ffffffff-5000-0000-0000-0000000000c1', 'ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c1', 'user', repeat('x', 4001))$q$, 'ERR=check constraint');
select pg_temp.chk('regras', 'papel inválido é recusado', $q$insert into public.chat_messages (session_id, company_id, user_id, role, text) values ('ffffffff-5000-0000-0000-0000000000c1', 'ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c1', 'bot', 'x')$q$, 'ERR=check constraint');
delete from public.chat_sessions where id = 'ffffffff-5000-0000-0000-0000000000c2';
select pg_temp.chk('regras', 'apagar a sessão apaga mensagens e rascunhos dela (cascata)', $q$select ((select count(*) from public.chat_messages where session_id = 'ffffffff-5000-0000-0000-0000000000c2') + (select count(*) from public.chat_drafts where session_id = 'ffffffff-5000-0000-0000-0000000000c2'))::text$q$, 'OK=0');

-- ================================================= ROTINAS
insert into public.chat_drafts (id, company_id, user_id, session_id, module, intent, risk, status, expires_at) values
  ('ffffffff-6000-0000-0000-0000000000d1', 'ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c1', 'ffffffff-5000-0000-0000-0000000000c1', 'agenda', 'agenda.agendar', 'R1', 'aguardando_confirmacao', now() - interval '1 minute'),
  ('ffffffff-6000-0000-0000-0000000000d2', 'ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c1', 'ffffffff-5000-0000-0000-0000000000c1', 'agenda', 'agenda.agendar', 'R1', 'executando', now() - interval '1 minute'),
  ('ffffffff-6000-0000-0000-0000000000d3', 'ffffffff-1000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-0000000000c1', 'ffffffff-5000-0000-0000-0000000000c1', 'agenda', 'agenda.agendar', 'R1', 'concluido', now() - interval '1 minute');
select pg_temp.chk('rotinas', 'expirar: só 1 rascunho vencido e não terminado vira expirado', $q$select public.chat_expire_due_drafts()::text$q$, 'OK=1');
select pg_temp.chk('rotinas', 'o vencido virou expirado', $q$select status from public.chat_drafts where id = 'ffffffff-6000-0000-0000-0000000000d1'$q$, 'OK=expirado');
select pg_temp.chk('rotinas', 'executando NÃO expira (gravação em curso)', $q$select status from public.chat_drafts where id = 'ffffffff-6000-0000-0000-0000000000d2'$q$, 'OK=executando');
select pg_temp.chk('rotinas', 'concluído continua concluído', $q$select status from public.chat_drafts where id = 'ffffffff-6000-0000-0000-0000000000d3'$q$, 'OK=concluido');
update public.chat_messages set created_at = now() - interval '100 days' where text = 'oi';
select pg_temp.chk('rotinas', 'retenção: apaga a mensagem de 100 dias (padrão 90) e mantém as recentes', $q$select public.chat_purge_old_messages()::text$q$, 'OK=1');

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
