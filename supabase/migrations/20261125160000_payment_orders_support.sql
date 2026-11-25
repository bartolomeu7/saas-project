-- =============================================================================
-- Ordem de pagamento (numero legivel por cobranca) e chamados de suporte ligados a ela.
--  - subscription_payments.order_number: sequencial, unico, gerado pelo banco e imutavel; exibido como OP-000001.
--    As cobrancas ja existentes sao numeradas pela data de criacao (sem alterar updated_at).
--  - payment_support_tickets: o cliente abre pela funcao open_payment_ticket (so membro da empresa dona da ordem; um chamado
--    aberto por ordem; no maximo 10 por empresa em 24 h); le apenas os da propria empresa. A equipe da plataforma lista e
--    resolve com resposta (auditado). Chamado NAO muda pagamento nem assinatura.
-- Reversao: supabase/rollback/20261125160000_payment_orders_support.down.sql
-- =============================================================================
begin;

alter table public.subscription_payments add column order_number bigint;
alter table public.subscription_payments disable trigger subscription_payments_set_updated_at;
update public.subscription_payments p
   set order_number = n.rn
  from (select id, row_number() over (order by created_at, id) as rn from public.subscription_payments) n
 where n.id = p.id;
alter table public.subscription_payments enable trigger subscription_payments_set_updated_at;
alter table public.subscription_payments alter column order_number set not null;
alter table public.subscription_payments alter column order_number add generated always as identity;
select setval(pg_get_serial_sequence('public.subscription_payments', 'order_number'),
              coalesce((select max(order_number) from public.subscription_payments), 0) + 1, false);
create unique index subscription_payments_order_number_key on public.subscription_payments (order_number);

create or replace function public.payment_order_code(p_number bigint)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select 'OP-' || lpad(p_number::text, greatest(6, length(p_number::text)), '0');
$function$;
revoke all on function public.payment_order_code(bigint) from public, anon;
grant execute on function public.payment_order_code(bigint) to authenticated, service_role;

create table public.payment_support_tickets (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.subscription_payments (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  opened_by uuid references public.profiles (user_id) on delete set null,
  reason text not null check (reason in ('paid_not_released', 'pix_problem', 'wrong_charge', 'refund', 'other')),
  message text not null check (char_length(message) between 10 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  reply text check (reply is null or char_length(reply) between 3 and 1000),
  resolved_by uuid references public.profiles (user_id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payment_support_tickets_resolution check ((status = 'resolved') = (resolved_at is not null and reply is not null))
);
create unique index payment_support_tickets_one_open_idx on public.payment_support_tickets (payment_id) where status = 'open';
create index payment_support_tickets_payment_idx on public.payment_support_tickets (payment_id);
create index payment_support_tickets_company_idx on public.payment_support_tickets (company_id, created_at desc);
create index payment_support_tickets_status_idx on public.payment_support_tickets (status, created_at desc);
create index payment_support_tickets_opened_by_idx on public.payment_support_tickets (opened_by);
create index payment_support_tickets_resolved_by_idx on public.payment_support_tickets (resolved_by);

alter table public.payment_support_tickets enable row level security;
revoke all on table public.payment_support_tickets from public, anon, authenticated;
-- o cliente nao ve quem abriu/resolveu (identificadores internos); escrita so pelas funcoes
grant select (id, payment_id, company_id, reason, message, status, reply, resolved_at, created_at) on public.payment_support_tickets to authenticated;
grant all on table public.payment_support_tickets to service_role;
create policy payment_support_tickets_select_own_company on public.payment_support_tickets
  for select to authenticated
  using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = (select public.current_profile_user_id())));

create or replace function public.open_payment_ticket(p_payment_id uuid, p_reason text, p_message text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := public.current_profile_user_id();
  v_payment public.subscription_payments;
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  -- controle (menos quebra de linha) sai; o texto e exibido como texto puro
  v_message text := btrim(regexp_replace(coalesce(p_message, ''), '[\x01-\x09\x0B-\x1F\x7F]', ' ', 'g'), E' \n');
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'not authorized';
  end if;

  -- mesma resposta para ordem inexistente e ordem de outra empresa
  select sp.* into v_payment
    from public.subscription_payments sp
   where sp.id = p_payment_id
     and exists (select 1 from public.company_members cm where cm.company_id = sp.company_id and cm.user_id = v_actor);
  if not found then
    raise exception 'Ordem de pagamento não encontrada.';
  end if;
  if v_reason not in ('paid_not_released', 'pix_problem', 'wrong_charge', 'refund', 'other') then
    raise exception 'Escolha o assunto do chamado.';
  end if;
  if char_length(v_message) < 10 or char_length(v_message) > 1000 then
    raise exception 'Descreva o problema com 10 a 1000 caracteres.';
  end if;

  perform pg_advisory_xact_lock(hashtext('payment_ticket:' || v_payment.company_id::text));

  if exists (select 1 from public.payment_support_tickets where payment_id = v_payment.id and status = 'open') then
    raise exception 'Já existe um chamado aberto para esta ordem. Aguarde a resposta.';
  end if;
  if (select count(*) from public.payment_support_tickets
       where company_id = v_payment.company_id and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Limite de chamados do dia atingido. Tente novamente amanhã.';
  end if;

  insert into public.payment_support_tickets (payment_id, company_id, opened_by, reason, message)
  values (v_payment.id, v_payment.company_id, v_actor, v_reason, v_message)
  returning id into v_id;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_payment.company_id, v_actor, 'subscription_payment', v_payment.id, 'subscription_payment.ticket_opened',
          jsonb_build_object('ticket_id', v_id, 'reason', v_reason, 'order', public.payment_order_code(v_payment.order_number)));

  return v_id;
end;
$function$;
revoke all on function public.open_payment_ticket(uuid, text, text) from public, anon;
grant execute on function public.open_payment_ticket(uuid, text, text) to authenticated, service_role;

create or replace function public.list_platform_payment_tickets(p_status text default 'open', p_limit integer default 25, p_offset integer default 0)
returns table(ticket_id uuid, payment_id uuid, order_number bigint, company_id uuid, company_name text, plan_name text, amount numeric,
              payment_status public.subscription_payment_status, reason text, message text, status text, opened_by_email text,
              created_at timestamptz, total_count bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  return query
  select t.id, sp.id, sp.order_number, c.id, c.name, pl.name, sp.amount, sp.status, t.reason, t.message, t.status, p.email,
         t.created_at, count(*) over ()
    from public.payment_support_tickets t
    join public.subscription_payments sp on sp.id = t.payment_id
    join public.companies c on c.id = t.company_id
    join public.plans pl on pl.id = sp.plan_id
    left join public.profiles p on p.user_id = t.opened_by
   where (p_status is null or t.status = p_status)
   -- abertos: o mais antigo primeiro (fila); resolvidos: o mais recente primeiro
   order by case when t.status = 'open' then t.created_at end asc, t.created_at desc, t.id
   limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;
revoke all on function public.list_platform_payment_tickets(text, integer, integer) from public, anon;
grant execute on function public.list_platform_payment_tickets(text, integer, integer) to authenticated, service_role;

create or replace function public.resolve_platform_payment_ticket(p_ticket_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ticket public.payment_support_tickets;
  v_reply text := btrim(coalesce(p_reply, ''), E' \n\r\t');
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if char_length(v_reply) < 3 or char_length(v_reply) > 1000 then
    raise exception 'Escreva a resposta com 3 a 1000 caracteres.';
  end if;
  select * into v_ticket from public.payment_support_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Chamado não encontrado.';
  end if;
  if v_ticket.status <> 'open' then
    raise exception 'Este chamado já foi resolvido.';
  end if;

  update public.payment_support_tickets
     set status = 'resolved', reply = v_reply, resolved_by = public.current_profile_user_id(), resolved_at = now()
   where id = p_ticket_id;

  perform public.write_platform_audit_log(
    'platform.support.ticket_resolved', 'subscription_payment', v_ticket.payment_id, v_ticket.company_id, null,
    jsonb_build_object('ticket_id', p_ticket_id)
  );
end;
$function$;
revoke all on function public.resolve_platform_payment_ticket(uuid, text) from public, anon;
grant execute on function public.resolve_platform_payment_ticket(uuid, text) to authenticated, service_role;

-- painel: numero da ordem na lista (e na busca) e chamados no detalhe. A coluna nova vai no FIM: o codigo anterior segue valendo.
drop function public.list_platform_payments(text, public.subscription_payment_status, text, text, text, timestamptz, timestamptz, text, integer, integer);
CREATE OR REPLACE FUNCTION public.list_platform_payments(p_search text DEFAULT NULL::text, p_status subscription_payment_status DEFAULT NULL::subscription_payment_status, p_provider text DEFAULT NULL::text, p_method text DEFAULT NULL::text, p_plan_code text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sort text DEFAULT 'created_desc'::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(payment_id uuid, company_id uuid, company_name text, plan_code text, plan_name text, provider text, method text, status subscription_payment_status, amount numeric, currency text, external_reference text, paid_at timestamp with time zone, created_at timestamp with time zone, recorded_by_email text, total_count bigint, order_number bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_pattern text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if nullif(trim(coalesce(p_search, '')), '') is not null then
    v_pattern := '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select sp.id, sp.company_id, c.name, pl.code, pl.name, sp.provider, sp.method, sp.status, sp.amount, sp.currency,
         sp.external_reference, sp.paid_at, sp.created_at, rp.email, count(*) over (), sp.order_number
  from public.subscription_payments sp
  join public.companies c on c.id = sp.company_id
  join public.plans pl on pl.id = sp.plan_id
  left join public.profiles rp on rp.user_id = sp.recorded_by
  where (p_status is null or sp.status = p_status)
    and (p_provider is null or sp.provider = p_provider)
    and (p_method is null or sp.method = p_method)
    and (p_plan_code is null or pl.code = p_plan_code)
    and (p_from is null or sp.created_at >= p_from)
    and (p_to is null or sp.created_at < p_to)
    and (v_pattern is null or c.name ilike v_pattern escape '\' or sp.external_reference ilike v_pattern escape '\'
         or public.payment_order_code(sp.order_number) ilike v_pattern escape '\')
  order by
    case when p_sort = 'amount_desc' then sp.amount end desc,
    case when p_sort = 'created_asc' then sp.created_at end asc,
    sp.created_at desc, sp.id
  limit v_limit offset v_offset;
end;
$function$;
revoke all on function public.list_platform_payments(text, public.subscription_payment_status, text, text, text, timestamptz, timestamptz, text, integer, integer) from public, anon;
grant execute on function public.list_platform_payments(text, public.subscription_payment_status, text, text, text, timestamptz, timestamptz, text, integer, integer) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_platform_payment_detail(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := public.current_profile_user_id();
  v_is_super boolean := public.is_super_admin();
  v_p public.subscription_payments;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_p from public.subscription_payments where id = p_payment_id;
  if not found then
    raise exception 'Pagamento não encontrado.';
  end if;

  return jsonb_build_object(
    'payment', jsonb_build_object(
      'id', v_p.id, 'order_number', v_p.order_number, 'company_id', v_p.company_id,
      'company_name', (select name from public.companies where id = v_p.company_id),
      'plan_code', (select code from public.plans where id = v_p.plan_id),
      'plan_name', (select name from public.plans where id = v_p.plan_id),
      'provider', v_p.provider, 'method', v_p.method, 'status', v_p.status,
      'amount', v_p.amount, 'amount_with_tax', v_p.amount_with_tax, 'currency', v_p.currency,
      'external_reference', v_p.external_reference, 'notes', v_p.notes,
      'provider_transaction_id', v_p.provider_transaction_id, 'end_to_end_id', v_p.end_to_end_id,
      'payer_name', v_p.payer_name,
      'payer_document_masked', case when v_p.payer_document is null then null
                                    else '***' || right(regexp_replace(v_p.payer_document, '\D', '', 'g'), 4) end,
      'due_at', v_p.due_at, 'paid_at', v_p.paid_at, 'created_at', v_p.created_at, 'updated_at', v_p.updated_at,
      'recorded_by_email', (select email from public.profiles where user_id = v_p.recorded_by)
    ),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'reason', t.reason, 'message', t.message, 'status', t.status, 'reply', t.reply,
                                          'opened_by_email', (select email from public.profiles where user_id = t.opened_by),
                                          'resolved_at', t.resolved_at, 'created_at', t.created_at)
                       order by t.created_at desc)
      from public.payment_support_tickets t where t.payment_id = v_p.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', e.event_id, 'event_type', e.event_type,
                                          'processed', e.processed, 'processed_at', e.processed_at, 'created_at', e.created_at)
                       order by e.created_at desc)
      from public.payment_events e where e.subscription_payment_id = v_p.id
    ), '[]'::jsonb),
    'deliveries', coalesce((
      select jsonb_agg(jsonb_build_object('provider', d.provider, 'outcome', d.outcome, 'detail', d.detail, 'received_at', d.received_at)
                       order by d.received_at desc)
      from public.webhook_deliveries d where d.payment_id = v_p.id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(y order by y.created_at desc) from (
        select a.id, a.action, public.platform_audit_category(a.action) as category, a.created_at,
               ap.email as actor_email, public.platform_safe_metadata(a.metadata) as metadata
        from public.audit_logs a left join public.profiles ap on ap.user_id = a.actor_user_id
        where a.entity_type = 'subscription_payment' and a.entity_id = v_p.id
          and (v_is_super or a.actor_user_id = v_actor)
        order by a.created_at desc limit 20
      ) y
    ), '[]'::jsonb)
  );
end;
$function$;

commit;
