-- =============================================================================
-- Gestão completa de planos + limites de uso (vagas de usuário, sessões simultâneas, teste grátis por IP).
-- Aplicada SOMENTE em TEST nesta missão. Production exige autorização própria.
--
-- REUSO: nenhuma tabela de plano/assinatura/permissão paralela. Estende `plans`, reutiliza `platform_settings`
-- (limites configuráveis), `audit_logs` (histórico), `company_entitlements.max_additional_users` (vagas), as RPCs
-- `create_platform_plan` / `update_platform_plan` / `set_platform_plan_status` e `create_company_with_owner`.
--
-- 1. plans: campos comerciais (destaque, texto auxiliar, CTA, contato, visibilidade, preço anterior/promoção).
-- 2. plan_benefits: benefícios COMERCIAIS (texto). Direitos reais continuam nos campos de `plans`/`company_entitlements`.
-- 3. admin_save_plan(): criação/edição ATÔMICA (super_admin), reusa as RPCs existentes + auditoria com antes/depois.
-- 4. get_public_plans() / list_platform_plans(): leitura única validada (desconto calculado no banco).
-- 5. Trigger de vagas em company_members (defesa no banco, atômica) + get_company_seat_usage().
-- 6. Sessões simultâneas: user_session_slots + session_slot_status / register_session_slot / release_session_slot.
-- 7. Teste grátis por IP: trial_signup_events + authorize_trial_signup(); create_company_with_owner só concede o teste
--    com autorização registrada pelo servidor (service_role) — chamada direta do cliente NÃO ganha teste.
-- 8. claim_subscription_payment(): recusa plano trial/sem preço positivo (nunca cobra R$ 0).
--
-- Rollback: supabase/rollback/20261014000000_plans_management_and_usage_limits.down.sql
-- =============================================================================
begin;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. plans: campos comerciais
-- ---------------------------------------------------------------------------------------------------------------
alter table public.plans
  add column if not exists tagline text,
  add column if not exists highlight text,
  add column if not exists public_visible boolean not null default true,
  add column if not exists cta_label text,
  add column if not exists contact_url text,
  add column if not exists benefits_title text,
  add column if not exists compare_price numeric(12,2),
  add column if not exists promo_enabled boolean not null default false,
  add column if not exists promo_starts_at timestamptz,
  add column if not exists promo_ends_at timestamptz,
  add column if not exists show_compare_price boolean not null default true,
  add column if not exists show_discount_percent boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.plans'::regclass and conname = 'plans_highlight_valid') then
    alter table public.plans add constraint plans_highlight_valid check (highlight is null or highlight in ('popular', 'value'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.plans'::regclass and conname = 'plans_text_lengths') then
    alter table public.plans add constraint plans_text_lengths check (
      (tagline is null or char_length(tagline) <= 60) and (cta_label is null or char_length(cta_label) <= 40)
      and (benefits_title is null or char_length(benefits_title) <= 80));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.plans'::regclass and conname = 'plans_contact_url_format') then
    alter table public.plans add constraint plans_contact_url_format check (
      contact_url is null or (char_length(contact_url) <= 500
        and contact_url ~ '^(https://[^[:space:]]+|mailto:[^[:space:]@]+@[^[:space:]@]+|/([A-Za-z0-9_#?=&.-][A-Za-z0-9/_#?=&.-]*)?)$'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.plans'::regclass and conname = 'plans_compare_price_range') then
    alter table public.plans add constraint plans_compare_price_range check (compare_price is null or (compare_price > 0 and compare_price <= 100000));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.plans'::regclass and conname = 'plans_compare_above_price') then
    alter table public.plans add constraint plans_compare_above_price check (compare_price is null or (price is not null and compare_price > price));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.plans'::regclass and conname = 'plans_promo_window_coherent') then
    alter table public.plans add constraint plans_promo_window_coherent check (promo_starts_at is null or promo_ends_at is null or promo_ends_at > promo_starts_at);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.plans'::regclass and conname = 'plans_promo_requires_compare') then
    alter table public.plans add constraint plans_promo_requires_compare check (not promo_enabled or compare_price is not null);
  end if;
  -- NOT VALID: vale para toda escrita nova; linhas antigas não são reescritas nem reprovadas.
  if not exists (select 1 from pg_constraint where conrelid = 'public.plans'::regclass and conname = 'plans_currency_supported') then
    alter table public.plans add constraint plans_currency_supported check (currency = 'BRL') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.plans'::regclass and conname = 'plans_custom_has_no_price') then
    alter table public.plans add constraint plans_custom_has_no_price check (code <> 'CUSTOM' or price is null) not valid;
  end if;
end $$;

-- Valores iniciais a partir do conteúdo que já estava publicado na home (nada inventado). Só preenche o que está vazio.
update public.plans set sort_order = 10 where code = 'FREE_TRIAL' and sort_order = 0;
update public.plans set sort_order = 20 where code = 'MONTHLY' and sort_order = 0;
update public.plans set sort_order = 30 where code = 'QUARTERLY' and sort_order = 0;
update public.plans set sort_order = 40 where code = 'YEARLY' and sort_order = 0;
update public.plans set sort_order = 50 where code = 'CUSTOM' and sort_order = 0;

update public.plans set tagline = '1 dia', cta_label = 'Começar teste grátis'
  where code = 'FREE_TRIAL' and tagline is null and cta_label is null;
update public.plans set tagline = 'Mais escolhido', highlight = 'popular', cta_label = 'Assinar mensal'
  where code = 'MONTHLY' and tagline is null and cta_label is null;
update public.plans set cta_label = 'Assinar trimestral' where code = 'QUARTERLY' and cta_label is null;
update public.plans set tagline = 'Melhor custo-benefício', highlight = 'value', cta_label = 'Assinar anual'
  where code = 'YEARLY' and tagline is null and cta_label is null;
update public.plans set tagline = 'Solicite um orçamento', cta_label = 'Solicitar orçamento',
       benefits_title = 'Precisa de mais tempo?'
  where code = 'CUSTOM' and tagline is null and cta_label is null;

update public.plans set description = 'Experimente o Prime Ges por 1 dia e conheça a plataforma.'
  where code = 'FREE_TRIAL' and description is null;
update public.plans set description = 'Tenha acesso completo ao Prime Ges durante 31 dias.' where code = 'MONTHLY' and description is null;
update public.plans set description = 'Acesso ao Prime Ges garantido por 93 dias.' where code = 'QUARTERLY' and description is null;
update public.plans set description = 'Acesso ao Prime Ges garantido por 365 dias.' where code = 'YEARLY' and description is null;
update public.plans set description = 'Precisa de um período maior ou deseja contratar o Prime Ges por um prazo personalizado? Fale com nossa equipe para solicitar uma proposta.'
  where code = 'CUSTOM' and description is null;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. plan_benefits (texto comercial; NÃO concede acesso a nada)
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.plan_benefits (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete restrict,
  text text not null check (char_length(btrim(text)) between 1 and 140),
  highlighted boolean not null default false,
  visible boolean not null default true,
  included boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_benefits_plan_order_idx on public.plan_benefits (plan_id, sort_order) where archived_at is null;
drop trigger if exists plan_benefits_set_updated_at on public.plan_benefits;
create trigger plan_benefits_set_updated_at before update on public.plan_benefits for each row execute function public.set_updated_at();
alter table public.plan_benefits enable row level security;
revoke all on public.plan_benefits from anon, authenticated;
grant all on public.plan_benefits to service_role;

insert into public.plan_benefits (plan_id, text, sort_order, included)
select p.id, v.text, v.ord, true
  from public.plans p
  join (values
    ('FREE_TRIAL', 'Acesso à plataforma durante o teste', 10),
    ('FREE_TRIAL', 'Conhecer as principais funcionalidades', 20),
    ('FREE_TRIAL', 'Avaliar o sistema antes de assinar', 30),
    ('MONTHLY', 'Acesso às ferramentas da plataforma', 10),
    ('MONTHLY', 'Atualizações constantes da plataforma', 20),
    ('QUARTERLY', 'Acesso às ferramentas da plataforma', 10),
    ('QUARTERLY', 'Atualizações constantes da plataforma', 20),
    ('YEARLY', 'Acesso às ferramentas da plataforma', 10),
    ('YEARLY', 'Atualizações constantes da plataforma', 20)
  ) as v(code, text, ord) on v.code = p.code
 where not exists (select 1 from public.plan_benefits b where b.plan_id = p.id);

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Cálculo de desconto/promoção (uma única definição, no banco)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.plan_discount_percent(p_price numeric, p_compare numeric)
returns numeric language sql immutable set search_path = public as $$
  select case when p_price is null or p_compare is null or p_price <= 0 or p_compare <= p_price then null
              else round((p_compare - p_price) / p_compare * 100, 1) end;
$$;

create or replace function public.plan_promo_state(p_enabled boolean, p_starts timestamptz, p_ends timestamptz, p_at timestamptz default now())
returns text language sql stable set search_path = public as $$
  select case when not coalesce(p_enabled, false) then 'none'
              when p_starts is not null and p_starts > p_at then 'scheduled'
              when p_ends is not null and p_ends <= p_at then 'expired'
              else 'active' end;
$$;

create or replace function public.plan_kind(p_code text, p_trial boolean, p_lifetime boolean)
returns text language sql immutable set search_path = public as $$
  select case when p_lifetime then 'lifetime' when p_trial then 'trial' when p_code = 'CUSTOM' then 'custom' else 'standard' end;
$$;

revoke all on function public.plan_discount_percent(numeric, numeric) from public, anon;
revoke all on function public.plan_promo_state(boolean, timestamptz, timestamptz, timestamptz) from public, anon;
revoke all on function public.plan_kind(text, boolean, boolean) from public, anon;
grant execute on function public.plan_discount_percent(numeric, numeric) to authenticated, service_role;
grant execute on function public.plan_promo_state(boolean, timestamptz, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.plan_kind(text, boolean, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Leitura pública (anon) e administrativa
-- ---------------------------------------------------------------------------------------------------------------
drop function if exists public.get_public_plans();
create function public.get_public_plans()
returns table(
  id uuid, code text, name text, description text, price numeric, currency text, access_duration_days integer,
  additional_user_limit integer, trial boolean, support_enabled boolean, tickets_enabled boolean,
  exclusive_groups_enabled boolean, early_access_enabled boolean, status plan_status,
  kind text, tagline text, highlight text, cta_label text, contact_url text, benefits_title text, sort_order integer,
  compare_price numeric, discount_percent numeric, savings_amount numeric, promo_ends_at timestamptz, benefits jsonb
)
language sql stable security definer set search_path = public as $$
  select p.id, p.code, p.name, p.description, p.price, p.currency, p.access_duration_days,
         p.additional_user_limit, p.trial, p.support_enabled, p.tickets_enabled, p.exclusive_groups_enabled,
         p.early_access_enabled, p.status,
         public.plan_kind(p.code, p.trial, p.lifetime), p.tagline, p.highlight, p.cta_label, p.contact_url, p.benefits_title,
         p.sort_order,
         case when x.valid and p.show_compare_price then p.compare_price end,
         case when x.valid and p.show_discount_percent then public.plan_discount_percent(p.price, p.compare_price) end,
         case when x.valid and p.show_discount_percent then p.compare_price - p.price end,
         case when x.valid then p.promo_ends_at end,
         coalesce((select jsonb_agg(jsonb_build_object('text', b.text, 'highlighted', b.highlighted, 'included', b.included)
                                    order by b.sort_order, b.created_at)
                     from public.plan_benefits b
                    where b.plan_id = p.id and b.visible and b.archived_at is null), '[]'::jsonb)
    from public.plans p
   cross join lateral (select public.plan_promo_state(p.promo_enabled, p.promo_starts_at, p.promo_ends_at) = 'active'
                              and public.plan_discount_percent(p.price, p.compare_price) is not null as valid) x
   where p.status = 'active' and not p.lifetime and p.public_visible
   order by p.sort_order, p.price nulls last, p.code;
$$;
revoke all on function public.get_public_plans() from public;
grant execute on function public.get_public_plans() to anon, authenticated, service_role;

drop function if exists public.list_platform_plans();
create function public.list_platform_plans()
returns table(
  plan_id uuid, code text, name text, description text, price numeric, currency text, access_duration_days integer,
  billing_interval billing_interval, additional_user_limit integer, trial boolean, support_enabled boolean,
  tickets_enabled boolean, exclusive_groups_enabled boolean, early_access_enabled boolean, status plan_status,
  sort_order integer, created_at timestamptz, subscriptions_count bigint, active_subscriptions_count bigint,
  payments_count bigint, is_protected boolean, lifetime boolean,
  updated_at timestamptz, kind text, public_visible boolean, tagline text, highlight text, cta_label text,
  contact_url text, benefits_title text, compare_price numeric, promo_enabled boolean, promo_starts_at timestamptz,
  promo_ends_at timestamptz, show_compare_price boolean, show_discount_percent boolean, promo_state text,
  discount_percent numeric, benefits jsonb
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select p.id, p.code, p.name, p.description, p.price, p.currency, p.access_duration_days, p.billing_interval,
         p.additional_user_limit, p.trial, p.support_enabled, p.tickets_enabled, p.exclusive_groups_enabled,
         p.early_access_enabled, p.status, p.sort_order, p.created_at,
         (select count(*) from public.subscriptions s where s.plan_id = p.id),
         (select count(*) from public.subscriptions s where s.plan_id = p.id and s.status in ('active', 'trialing') and (s.lifetime or s.expires_at > now())),
         (select count(*) from public.subscription_payments sp where sp.plan_id = p.id),
         p.code in ('FREE_TRIAL', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'), p.lifetime,
         p.updated_at, public.plan_kind(p.code, p.trial, p.lifetime), p.public_visible, p.tagline, p.highlight, p.cta_label,
         p.contact_url, p.benefits_title, p.compare_price, p.promo_enabled, p.promo_starts_at, p.promo_ends_at,
         p.show_compare_price, p.show_discount_percent,
         public.plan_promo_state(p.promo_enabled, p.promo_starts_at, p.promo_ends_at),
         public.plan_discount_percent(p.price, p.compare_price),
         coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'text', b.text, 'highlighted', b.highlighted,
                                                       'visible', b.visible, 'included', b.included)
                                    order by b.sort_order, b.created_at)
                     from public.plan_benefits b where b.plan_id = p.id and b.archived_at is null), '[]'::jsonb)
  from public.plans p
  order by p.sort_order, p.price nulls last, p.code;
end;
$$;
revoke all on function public.list_platform_plans() from public, anon;
grant execute on function public.list_platform_plans() to authenticated, service_role;

create or replace function public.list_platform_plan_history(p_plan_id uuid, p_limit integer default 50)
returns table(id uuid, action text, created_at timestamptz, actor_email text, metadata jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_super boolean := public.is_super_admin();
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if p_plan_id is null or not exists (select 1 from public.plans where id = p_plan_id) then
    raise exception 'Plano não encontrado.';
  end if;
  return query
  select a.id, a.action, a.created_at, case when v_super then ap.email else null end,
         public.platform_safe_metadata(a.metadata)
    from public.audit_logs a
    left join public.profiles ap on ap.user_id = a.actor_user_id
   where a.entity_type = 'plan' and a.entity_id = p_plan_id
   order by a.created_at desc, a.id
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;
revoke all on function public.list_platform_plan_history(uuid, integer) from public, anon;
grant execute on function public.list_platform_plan_history(uuid, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. admin_save_plan: criar/editar atomicamente (super_admin). Reusa create/update/set_status existentes.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.admin_save_plan(p_plan_id uuid, p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_old public.plans;
  v_new public.plans;
  v_id uuid := p_plan_id;
  v_creating boolean := p_plan_id is null;
  -- núcleo
  v_name text; v_desc text; v_price numeric; v_days integer; v_interval public.billing_interval; v_users integer;
  v_trial boolean; v_support boolean; v_tickets boolean; v_groups boolean; v_early boolean; v_sort integer;
  -- extensão
  v_tagline text; v_highlight text; v_visible boolean; v_cta text; v_contact text; v_btitle text; v_compare numeric;
  v_promo boolean; v_pstart timestamptz; v_pend timestamptz; v_showcmp boolean; v_showpct boolean;
  v_status public.plan_status;
  v_core_changed boolean;
  v_from jsonb := '{}'::jsonb; v_to jsonb := '{}'::jsonb;
  v_benefits jsonb; v_ben_before jsonb; v_ben_after jsonb; v_added int := 0; v_removed int := 0; v_edited int := 0;
  v_apply boolean := false; v_applied int := 0;
  v_item jsonb; v_ord int; v_bid uuid; v_btext text; v_row public.plan_benefits;
  v_keep uuid[] := '{}';
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 65536 then
    raise exception 'Parâmetros inválidos.';
  end if;

  if not v_creating then
    select * into v_old from public.plans where id = p_plan_id for update;
    if not found then raise exception 'Plano não encontrado.'; end if;
  end if;

  begin
    -- Presente no payload => valor do payload; ausente => valor atual (edição parcial). JSON null limpa o campo.
    v_name := case when p_payload ? 'name' then p_payload->>'name' else v_old.name end;
    v_desc := case when p_payload ? 'description' then nullif(btrim(p_payload->>'description'), '') else v_old.description end;
    v_price := case when p_payload ? 'price' then (p_payload->>'price')::numeric else v_old.price end;
    v_days := case when p_payload ? 'access_duration_days' then (p_payload->>'access_duration_days')::integer else v_old.access_duration_days end;
    v_interval := case when p_payload ? 'billing_interval' then nullif(p_payload->>'billing_interval', '')::public.billing_interval else v_old.billing_interval end;
    v_users := case when p_payload ? 'additional_user_limit' then (p_payload->>'additional_user_limit')::integer else coalesce(v_old.additional_user_limit, 0) end;
    v_trial := case when p_payload ? 'trial' then (p_payload->>'trial')::boolean else coalesce(v_old.trial, false) end;
    v_support := case when p_payload ? 'support_enabled' then (p_payload->>'support_enabled')::boolean else coalesce(v_old.support_enabled, false) end;
    v_tickets := case when p_payload ? 'tickets_enabled' then (p_payload->>'tickets_enabled')::boolean else coalesce(v_old.tickets_enabled, false) end;
    v_groups := case when p_payload ? 'exclusive_groups_enabled' then (p_payload->>'exclusive_groups_enabled')::boolean else coalesce(v_old.exclusive_groups_enabled, false) end;
    v_early := case when p_payload ? 'early_access_enabled' then (p_payload->>'early_access_enabled')::boolean else coalesce(v_old.early_access_enabled, false) end;
    v_sort := case when p_payload ? 'sort_order' then (p_payload->>'sort_order')::integer else coalesce(v_old.sort_order, 0) end;

    v_tagline := case when p_payload ? 'tagline' then nullif(btrim(p_payload->>'tagline'), '') else v_old.tagline end;
    v_highlight := case when p_payload ? 'highlight' then nullif(btrim(p_payload->>'highlight'), '') else v_old.highlight end;
    v_visible := case when p_payload ? 'public_visible' then (p_payload->>'public_visible')::boolean else coalesce(v_old.public_visible, true) end;
    v_cta := case when p_payload ? 'cta_label' then nullif(btrim(p_payload->>'cta_label'), '') else v_old.cta_label end;
    v_contact := case when p_payload ? 'contact_url' then nullif(btrim(p_payload->>'contact_url'), '') else v_old.contact_url end;
    v_btitle := case when p_payload ? 'benefits_title' then nullif(btrim(p_payload->>'benefits_title'), '') else v_old.benefits_title end;
    v_compare := case when p_payload ? 'compare_price' then (p_payload->>'compare_price')::numeric else v_old.compare_price end;
    v_promo := case when p_payload ? 'promo_enabled' then (p_payload->>'promo_enabled')::boolean else coalesce(v_old.promo_enabled, false) end;
    v_pstart := case when p_payload ? 'promo_starts_at' then (p_payload->>'promo_starts_at')::timestamptz else v_old.promo_starts_at end;
    v_pend := case when p_payload ? 'promo_ends_at' then (p_payload->>'promo_ends_at')::timestamptz else v_old.promo_ends_at end;
    v_showcmp := case when p_payload ? 'show_compare_price' then (p_payload->>'show_compare_price')::boolean else coalesce(v_old.show_compare_price, true) end;
    v_showpct := case when p_payload ? 'show_discount_percent' then (p_payload->>'show_discount_percent')::boolean else coalesce(v_old.show_discount_percent, true) end;
    v_status := case when p_payload ? 'status' then (p_payload->>'status')::public.plan_status else v_old.status end;
    v_apply := coalesce((p_payload->>'apply_limits_to_existing')::boolean, false);
  exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format
            or datetime_field_overflow or invalid_parameter_value then
    raise exception 'Parâmetros inválidos.';
  end;

  -- ----- validação comercial (o banco também tem CHECKs equivalentes) -----
  if v_tagline is not null and char_length(v_tagline) > 60 then raise exception 'O texto auxiliar deve ter até 60 caracteres.'; end if;
  if v_cta is not null and char_length(v_cta) > 40 then raise exception 'O texto do botão deve ter até 40 caracteres.'; end if;
  if v_btitle is not null and char_length(v_btitle) > 80 then raise exception 'O título dos benefícios deve ter até 80 caracteres.'; end if;
  if v_highlight is not null and v_highlight not in ('popular', 'value') then raise exception 'Destaque inválido.'; end if;
  if v_contact is not null and (char_length(v_contact) > 500
      or v_contact !~ '^(https://[^[:space:]]+|mailto:[^[:space:]@]+@[^[:space:]@]+|/([A-Za-z0-9_#?=&.-][A-Za-z0-9/_#?=&.-]*)?)$') then
    raise exception 'O destino de contato deve ser um link https://, um e-mail (mailto:) ou um caminho interno (/...).';
  end if;
  if v_price is not null and (v_price < 0 or v_price > 100000) then raise exception 'Preço inválido.'; end if;
  if v_compare is not null and (v_compare <= 0 or v_compare > 100000) then raise exception 'Preço anterior inválido.'; end if;
  if (case when v_creating then false else v_old.lifetime end) and (v_compare is not null or v_promo) then
    raise exception 'O plano vitalício não tem preço nem promoção.';
  end if;
  if (v_creating and coalesce(p_payload->>'code', '') = 'CUSTOM') or (not v_creating and v_old.code = 'CUSTOM') then
    if v_price is not null then raise exception 'O plano personalizado é sob consulta e não pode ter preço.'; end if;
    if v_compare is not null or v_promo then raise exception 'O plano personalizado não tem promoção.'; end if;
  elsif not v_trial and not (case when v_creating then false else v_old.lifetime end) then
    if v_price is null or v_price < 1 then
      raise exception 'O preço mínimo de um plano pago é R$ 1,00 (limite do provedor de pagamento).';
    end if;
  end if;
  if v_trial and (v_compare is not null or v_promo) then raise exception 'O plano de teste não tem promoção.'; end if;
  if v_compare is not null and (v_price is null or v_compare <= v_price) then
    raise exception 'O preço anterior deve ser maior que o preço atual.';
  end if;
  if v_promo and v_compare is null then raise exception 'Informe o preço anterior para ativar a promoção.'; end if;
  if v_pstart is not null and v_pend is not null and v_pend <= v_pstart then
    raise exception 'O término da promoção deve ser posterior ao início.';
  end if;

  -- ----- núcleo (reusa as RPCs existentes: validações, regras de uso e auditoria próprias) -----
  if v_creating then
    v_id := public.create_platform_plan(p_payload->>'code', v_name, v_desc, v_price, v_days, v_interval, v_users,
                                        v_trial, v_support, v_tickets, v_groups, v_early, v_sort);
    select * into v_old from public.plans where id = v_id;
  else
    v_core_changed := (v_name is distinct from v_old.name) or (v_desc is distinct from v_old.description)
      or (v_price is distinct from v_old.price) or (v_days is distinct from v_old.access_duration_days)
      or (v_interval is distinct from v_old.billing_interval) or (v_users is distinct from v_old.additional_user_limit)
      or (v_trial is distinct from v_old.trial) or (v_support is distinct from v_old.support_enabled)
      or (v_tickets is distinct from v_old.tickets_enabled) or (v_groups is distinct from v_old.exclusive_groups_enabled)
      or (v_early is distinct from v_old.early_access_enabled) or (v_sort is distinct from v_old.sort_order);
    if v_core_changed then
      perform public.update_platform_plan(v_id, v_name, v_desc, v_price, v_days, v_interval, v_users,
                                          v_trial, v_support, v_tickets, v_groups, v_early, v_sort);
    end if;
  end if;

  -- ----- extensão comercial -----
  if v_tagline is distinct from v_old.tagline then v_from := v_from || jsonb_build_object('tagline', v_old.tagline); v_to := v_to || jsonb_build_object('tagline', v_tagline); end if;
  if v_highlight is distinct from v_old.highlight then v_from := v_from || jsonb_build_object('highlight', v_old.highlight); v_to := v_to || jsonb_build_object('highlight', v_highlight); end if;
  if v_visible is distinct from v_old.public_visible then v_from := v_from || jsonb_build_object('public_visible', v_old.public_visible); v_to := v_to || jsonb_build_object('public_visible', v_visible); end if;
  if v_cta is distinct from v_old.cta_label then v_from := v_from || jsonb_build_object('cta_label', v_old.cta_label); v_to := v_to || jsonb_build_object('cta_label', v_cta); end if;
  if v_contact is distinct from v_old.contact_url then v_from := v_from || jsonb_build_object('contact_url', v_old.contact_url); v_to := v_to || jsonb_build_object('contact_url', v_contact); end if;
  if v_btitle is distinct from v_old.benefits_title then v_from := v_from || jsonb_build_object('benefits_title', v_old.benefits_title); v_to := v_to || jsonb_build_object('benefits_title', v_btitle); end if;
  if v_compare is distinct from v_old.compare_price then v_from := v_from || jsonb_build_object('compare_price', v_old.compare_price); v_to := v_to || jsonb_build_object('compare_price', v_compare); end if;
  if v_promo is distinct from v_old.promo_enabled then v_from := v_from || jsonb_build_object('promo_enabled', v_old.promo_enabled); v_to := v_to || jsonb_build_object('promo_enabled', v_promo); end if;
  if v_pstart is distinct from v_old.promo_starts_at then v_from := v_from || jsonb_build_object('promo_starts_at', v_old.promo_starts_at); v_to := v_to || jsonb_build_object('promo_starts_at', v_pstart); end if;
  if v_pend is distinct from v_old.promo_ends_at then v_from := v_from || jsonb_build_object('promo_ends_at', v_old.promo_ends_at); v_to := v_to || jsonb_build_object('promo_ends_at', v_pend); end if;
  if v_showcmp is distinct from v_old.show_compare_price then v_from := v_from || jsonb_build_object('show_compare_price', v_old.show_compare_price); v_to := v_to || jsonb_build_object('show_compare_price', v_showcmp); end if;
  if v_showpct is distinct from v_old.show_discount_percent then v_from := v_from || jsonb_build_object('show_discount_percent', v_old.show_discount_percent); v_to := v_to || jsonb_build_object('show_discount_percent', v_showpct); end if;

  if v_to <> '{}'::jsonb then
    update public.plans set tagline = v_tagline, highlight = v_highlight, public_visible = v_visible, cta_label = v_cta,
           contact_url = v_contact, benefits_title = v_btitle, compare_price = v_compare, promo_enabled = v_promo,
           promo_starts_at = v_pstart, promo_ends_at = v_pend, show_compare_price = v_showcmp, show_discount_percent = v_showpct
     where id = v_id;
  end if;

  -- ----- benefícios comerciais (arquivam o que sai; nada é apagado) -----
  if p_payload ? 'benefits' then
    v_benefits := p_payload->'benefits';
    if jsonb_typeof(v_benefits) <> 'array' or jsonb_array_length(v_benefits) > 20 then
      raise exception 'A lista de benefícios deve ter no máximo 20 itens.';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('text', b.text, 'highlighted', b.highlighted, 'visible', b.visible, 'included', b.included)
                              order by b.sort_order, b.created_at), '[]'::jsonb)
      into v_ben_before from public.plan_benefits b where b.plan_id = v_id and b.archived_at is null;

    v_ord := 0;
    for v_item in select value from jsonb_array_elements(v_benefits) loop
      v_ord := v_ord + 10;
      if jsonb_typeof(v_item) <> 'object' then raise exception 'Benefício inválido.'; end if;
      v_btext := btrim(coalesce(v_item->>'text', ''));
      if char_length(v_btext) < 1 or char_length(v_btext) > 140 then
        raise exception 'Cada benefício deve ter de 1 a 140 caracteres.';
      end if;
      begin
        v_bid := nullif(v_item->>'id', '')::uuid;
      exception when invalid_text_representation then
        raise exception 'Benefício inválido.';
      end;
      if v_bid is not null then
        select * into v_row from public.plan_benefits where id = v_bid and plan_id = v_id and archived_at is null for update;
        if not found then raise exception 'Benefício não encontrado neste plano.'; end if;
        if v_row.text is distinct from v_btext
           or v_row.highlighted is distinct from coalesce((v_item->>'highlighted')::boolean, false)
           or v_row.visible is distinct from coalesce((v_item->>'visible')::boolean, true)
           or v_row.included is distinct from coalesce((v_item->>'included')::boolean, true)
           or v_row.sort_order <> v_ord then
          update public.plan_benefits
             set text = v_btext, highlighted = coalesce((v_item->>'highlighted')::boolean, false),
                 visible = coalesce((v_item->>'visible')::boolean, true), included = coalesce((v_item->>'included')::boolean, true),
                 sort_order = v_ord
           where id = v_bid;
          v_edited := v_edited + 1;
        end if;
      else
        insert into public.plan_benefits (plan_id, text, highlighted, visible, included, sort_order)
        values (v_id, v_btext, coalesce((v_item->>'highlighted')::boolean, false), coalesce((v_item->>'visible')::boolean, true),
                coalesce((v_item->>'included')::boolean, true), v_ord)
        returning id into v_bid;
        v_added := v_added + 1;
      end if;
      v_keep := v_keep || v_bid;
    end loop;

    with archived as (
      update public.plan_benefits set archived_at = now(), visible = false
       where plan_id = v_id and archived_at is null and not (id = any (v_keep))
       returning 1)
    select count(*) into v_removed from archived;

    select coalesce(jsonb_agg(jsonb_build_object('text', b.text, 'highlighted', b.highlighted, 'visible', b.visible, 'included', b.included)
                              order by b.sort_order, b.created_at), '[]'::jsonb)
      into v_ben_after from public.plan_benefits b where b.plan_id = v_id and b.archived_at is null;
    if v_ben_before is distinct from v_ben_after then
      v_to := v_to || jsonb_build_object('benefits', jsonb_build_object('added', v_added, 'edited', v_edited, 'removed', v_removed,
                                                                         'before_count', jsonb_array_length(v_ben_before),
                                                                         'after_count', jsonb_array_length(v_ben_after)));
    end if;
  end if;

  -- ----- status (reusa a regra existente: planos do sistema não são desativados) -----
  if not v_creating and v_status is distinct from v_old.status then
    perform public.set_platform_plan_status(v_id, v_status);
  elsif v_creating and v_status = 'inactive' then
    perform public.set_platform_plan_status(v_id, 'inactive');
  end if;

  -- ----- propagação OPCIONAL e explícita para assinaturas já existentes (nunca automática) -----
  if v_apply then
    select * into v_new from public.plans where id = v_id;
    with upd as (
      update public.company_entitlements ce
         set max_additional_users = v_new.additional_user_limit, support_enabled = v_new.support_enabled,
             tickets_enabled = v_new.tickets_enabled, exclusive_groups_enabled = v_new.exclusive_groups_enabled,
             early_access_enabled = v_new.early_access_enabled
       where ce.plan_id = v_id and ce.status in ('trialing', 'active')
         and (ce.max_additional_users is distinct from v_new.additional_user_limit
              or ce.support_enabled is distinct from v_new.support_enabled
              or ce.tickets_enabled is distinct from v_new.tickets_enabled
              or ce.exclusive_groups_enabled is distinct from v_new.exclusive_groups_enabled
              or ce.early_access_enabled is distinct from v_new.early_access_enabled)
      returning 1)
    select count(*) into v_applied from upd;
    v_to := v_to || jsonb_build_object('limits_applied_to_existing', v_applied);
  end if;

  if v_to <> '{}'::jsonb then
    perform public.write_platform_audit_log('platform.plan.details_updated', 'plan', v_id, null, null,
      jsonb_build_object('code', v_old.code, 'from', v_from, 'to', v_to));
  end if;

  return v_id;
end;
$$;
revoke all on function public.admin_save_plan(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_plan(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Vagas de usuário: defesa NO BANCO + uso/limite para a UI
-- ---------------------------------------------------------------------------------------------------------------
-- SECURITY INVOKER de propósito: o gatilho só enxerga (via RLS) o que o chamador enxerga. As RPCs (security definer) e o
-- service_role têm acesso completo; um INSERT direto de `authenticated` em empresa alheia recebe uma mensagem uniforme,
-- sem revelar o limite nem a existência do entitlement de outro tenant.
create or replace function public.enforce_company_seat_limit()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_max integer;
  v_current integer;
begin
  if new.role = 'owner' then
    return new;
  end if;
  -- trava a linha de entitlements: inclusões simultâneas na última vaga se serializam aqui
  select ce.max_additional_users into v_max from public.company_entitlements ce where ce.company_id = new.company_id for update;
  select count(*) into v_current from public.company_members cm where cm.company_id = new.company_id and cm.role <> 'owner';
  if v_current >= coalesce(v_max, 0) then
    raise exception 'Limite de usuários do plano atingido (% usuário(s) adicional(is) além do proprietário). Altere o plano para adicionar mais pessoas.',
      coalesce(v_max, 0) using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_company_seat_limit() from public, anon, authenticated;
drop trigger if exists company_members_seat_limit on public.company_members;
create trigger company_members_seat_limit before insert on public.company_members
  for each row execute function public.enforce_company_seat_limit();

create or replace function public.get_company_seat_usage()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_company uuid;
  v_max integer;
  v_used integer;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  select cm.company_id into v_company from public.company_members cm where cm.user_id = v_user order by cm.created_at asc limit 1;
  if v_company is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  select coalesce(ce.max_additional_users, 0) into v_max from public.company_entitlements ce where ce.company_id = v_company;
  select count(*) into v_used from public.company_members cm where cm.company_id = v_company and cm.role <> 'owner';
  return jsonb_build_object('additional_used', v_used, 'additional_max', coalesce(v_max, 0),
                            'total_used', v_used + 1, 'total_allowed', coalesce(v_max, 0) + 1,
                            'over_limit', v_used > coalesce(v_max, 0), 'at_limit', v_used >= coalesce(v_max, 0));
end;
$$;
revoke all on function public.get_company_seat_usage() from public, anon;
grant execute on function public.get_company_seat_usage() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Configurações novas (limites configuráveis por super_admin; sem "desligar" pelo cliente)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.platform_setting_definitions()
returns table(key text, default_value integer, min_value integer, max_value integer, description text)
language sql immutable set search_path = public as $$
  select * from (values
    ('admin_max_free_days', 30, 1, 365,
     'Máximo de dias gratuitos que um ADMIN pode conceder em uma única operação (super_admin pode até 365).'),
    ('presence_online_seconds', 120, 90, 900,
     'Segundos desde o último sinal para um usuário contar como ONLINE (mínimo 90: o heartbeat do app roda a cada 60 s).'),
    ('presence_recent_minutes', 15, 5, 240,
     'Minutos desde o último sinal para um usuário contar como RECENTEMENTE ONLINE.'),
    ('max_concurrent_sessions', 3, 1, 20,
     'Sessões simultâneas ativas por conta. Ao atingir o limite, NOVAS sessões são recusadas pelo app (sessões já ativas não são derrubadas).'),
    ('trial_signup_ip_limit', 3, 1, 100,
     'Quantos cadastros podem receber o teste grátis a partir da mesma conexão (IP) dentro da janela.'),
    ('trial_signup_ip_window_hours', 24, 1, 720,
     'Janela, em horas, para contar os cadastros por conexão. O bloqueio expira sozinho quando a janela passa.'),
    ('trial_signup_retention_days', 30, 30, 365,
     'Dias de retenção dos registros antifraude do teste grátis (identificador derivado por HMAC, nunca o IP). Deve cobrir a janela.')
  ) as t(key, default_value, min_value, max_value, description);
$$;

create or replace function public.set_platform_setting(p_key text, p_value integer, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_def record;
  v_old integer;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_def from public.platform_setting_definitions() d where d.key = p_key;
  if not found then
    raise exception 'Configuração desconhecida.';
  end if;

  if p_value is null or p_value < v_def.min_value or p_value > v_def.max_value then
    raise exception 'Valor fora do intervalo permitido (% a %).', v_def.min_value, v_def.max_value;
  end if;

  if p_key = 'presence_online_seconds' and p_value > public.platform_setting_int('presence_recent_minutes', 15) * 60 then
    raise exception 'O limiar ONLINE não pode ser maior que o de RECENTEMENTE ONLINE.';
  end if;
  if p_key = 'presence_recent_minutes' and p_value * 60 < public.platform_setting_int('presence_online_seconds', 120) then
    raise exception 'O limiar RECENTEMENTE ONLINE não pode ser menor que o de ONLINE.';
  end if;
  if p_key = 'trial_signup_ip_window_hours' and p_value > public.platform_setting_int('trial_signup_retention_days', 30) * 24 then
    raise exception 'A janela não pode ser maior que a retenção dos registros antifraude.';
  end if;
  if p_key = 'trial_signup_retention_days' and p_value * 24 < public.platform_setting_int('trial_signup_ip_window_hours', 24) then
    raise exception 'A retenção não pode ser menor que a janela de contagem.';
  end if;

  v_old := public.platform_setting_int(p_key, v_def.default_value);

  insert into public.platform_settings (key, value, updated_at, updated_by)
  values (p_key, to_jsonb(p_value), now(), public.current_profile_user_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;

  perform public.write_platform_audit_log(
    'platform.settings.updated', 'platform_setting', md5('platform_setting:' || p_key)::uuid,
    null, null,
    jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value, 'reason', nullif(trim(coalesce(p_reason, '')), ''))
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 8. Sessões simultâneas (controle de APLICAÇÃO; o Clerk continua dono das sessões)
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.user_session_slots (
  session_id text primary key check (char_length(session_id) between 1 and 200),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  state text not null check (state in ('allowed', 'blocked')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  verified_at timestamptz not null default now()
);
create index if not exists user_session_slots_user_state_idx on public.user_session_slots (user_id, state);
create index if not exists user_session_slots_last_seen_idx on public.user_session_slots (last_seen_at);
alter table public.user_session_slots enable row level security;
revoke all on public.user_session_slots from anon, authenticated;
grant all on public.user_session_slots to service_role;

-- Leitura barata (JWT do próprio usuário): a sessão deste token já foi aceita/recusada?
create or replace function public.session_slot_status(p_session_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.current_profile_user_id();
  v_sid text := coalesce(nullif(auth.jwt() ->> 'sid', ''), nullif(p_session_id, ''));
  v_limit integer := public.platform_setting_int('max_concurrent_sessions', 3);
  v_row public.user_session_slots;
begin
  if v_user is null or v_sid is null then
    return jsonb_build_object('state', 'unknown', 'limit', v_limit);
  end if;
  select * into v_row from public.user_session_slots where session_id = v_sid and user_id = v_user;
  if not found then
    return jsonb_build_object('state', 'unknown', 'limit', v_limit);
  end if;
  if v_row.last_seen_at < now() - interval '60 seconds' then
    update public.user_session_slots set last_seen_at = now() where session_id = v_sid;
  end if;
  return jsonb_build_object('state', v_row.state, 'limit', v_limit,
                            'verified_age_seconds', extract(epoch from (now() - v_row.verified_at))::integer);
end;
$$;
revoke all on function public.session_slot_status(text) from public, anon;
grant execute on function public.session_slot_status(text) to authenticated, service_role;

-- Registro (SÓ service_role: a lista de sessões ativas vem do Clerk no servidor, nunca do navegador).
create or replace function public.register_session_slot(p_user_id uuid, p_session_id text, p_active_session_ids text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_limit integer;
  v_cur public.user_session_slots;
  v_count integer;
  v_active text[] := coalesce(p_active_session_ids, '{}');
begin
  if p_user_id is null or nullif(btrim(coalesce(p_session_id, '')), '') is null or char_length(p_session_id) > 200 then
    raise exception 'Parâmetros inválidos.';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'Usuário não encontrado.';
  end if;

  perform pg_advisory_xact_lock(hashtext('session_slots:' || p_user_id::text));
  v_limit := public.platform_setting_int('max_concurrent_sessions', 3);

  -- sessões que já não estão ativas no Clerk (expiradas/revogadas) liberam a vaga
  delete from public.user_session_slots where user_id = p_user_id and not (session_id = any (v_active));
  delete from public.user_session_slots where last_seen_at < now() - interval '30 days';

  if not (p_session_id = any (v_active)) then
    return jsonb_build_object('state', 'invalid', 'limit', v_limit);
  end if;

  select * into v_cur from public.user_session_slots where session_id = p_session_id;
  if v_cur.session_id is not null and v_cur.user_id <> p_user_id then
    raise exception 'Sessão inválida.';
  end if;

  select count(*) into v_count from public.user_session_slots
   where user_id = p_user_id and state = 'allowed' and session_id <> p_session_id;

  if v_cur.session_id is not null and v_cur.state = 'allowed' then
    update public.user_session_slots set last_seen_at = now(), verified_at = now() where session_id = p_session_id;
    return jsonb_build_object('state', 'allowed', 'limit', v_limit, 'active', v_count + 1);
  end if;

  if v_count < v_limit then
    insert into public.user_session_slots (session_id, user_id, state)
    values (p_session_id, p_user_id, 'allowed')
    on conflict (session_id) do update set state = 'allowed', last_seen_at = now(), verified_at = now();
    return jsonb_build_object('state', 'allowed', 'limit', v_limit, 'active', v_count + 1);
  end if;

  insert into public.user_session_slots (session_id, user_id, state)
  values (p_session_id, p_user_id, 'blocked')
  on conflict (session_id) do update set state = 'blocked', last_seen_at = now(), verified_at = now();
  if v_cur.session_id is null or v_cur.state <> 'blocked' then
    insert into public.audit_logs (company_id, actor_user_id, target_user_id, entity_type, entity_id, action, metadata)
    values (null, p_user_id, p_user_id, 'user_session', gen_random_uuid(), 'platform.session.limit_blocked',
            jsonb_build_object('limit', v_limit, 'active', v_count, '_origin', 'system'));
  end if;
  return jsonb_build_object('state', 'blocked', 'limit', v_limit, 'active', v_count);
end;
$$;
revoke all on function public.register_session_slot(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.register_session_slot(uuid, text, text[]) to service_role;

create or replace function public.release_session_slot(p_user_id uuid, p_session_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_deleted integer;
begin
  if p_user_id is null or nullif(btrim(coalesce(p_session_id, '')), '') is null then
    raise exception 'Parâmetros inválidos.';
  end if;
  perform pg_advisory_xact_lock(hashtext('session_slots:' || p_user_id::text));
  delete from public.user_session_slots where session_id = p_session_id and user_id = p_user_id;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    insert into public.audit_logs (company_id, actor_user_id, target_user_id, entity_type, entity_id, action, metadata)
    values (null, p_user_id, p_user_id, 'user_session', gen_random_uuid(), 'platform.session.revoked',
            jsonb_build_object('_origin', 'system'));
  end if;
  return v_deleted > 0;
end;
$$;
revoke all on function public.release_session_slot(uuid, text) from public, anon, authenticated;
grant execute on function public.release_session_slot(uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 9. Teste grátis: antifraude por conexão (HMAC do IP calculado no servidor) + concessão idempotente
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.trial_signup_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  ip_hash text not null check (char_length(ip_hash) between 16 and 64),
  outcome text not null check (outcome in ('allowed', 'denied_ip_limit', 'ip_unknown')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index if not exists trial_signup_events_ip_idx on public.trial_signup_events (ip_hash, created_at);
create index if not exists trial_signup_events_user_idx on public.trial_signup_events (user_id, created_at desc);
alter table public.trial_signup_events enable row level security;
revoke all on public.trial_signup_events from anon, authenticated;
grant all on public.trial_signup_events to service_role;

-- Chamada SÓ pelo servidor (service_role) com o HMAC do IP; o cliente não consegue nem chamar nem forjar o hash.
create or replace function public.authorize_trial_signup(p_user_id uuid, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_limit integer := public.platform_setting_int('trial_signup_ip_limit', 3);
  v_window integer := public.platform_setting_int('trial_signup_ip_window_hours', 24);
  v_retention integer := greatest(public.platform_setting_int('trial_signup_retention_days', 30), 1);
  v_prev public.trial_signup_events;
  v_count integer;
begin
  if p_user_id is null or not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'Usuário não encontrado.';
  end if;
  if p_ip_hash is not null and (char_length(p_ip_hash) < 16 or char_length(p_ip_hash) > 64) then
    raise exception 'Parâmetros inválidos.';
  end if;

  -- locks sempre na mesma ordem (conexão -> usuário): contagem atômica entre cadastros simultâneos
  perform pg_advisory_xact_lock(hashtext('trial_ip:' || coalesce(p_ip_hash, 'unknown')));
  perform pg_advisory_xact_lock(hashtext('trial_user:' || p_user_id::text));

  delete from public.trial_signup_events where created_at < now() - make_interval(days => greatest(v_retention, ceil(v_window / 24.0)::integer));

  if exists (select 1 from public.subscriptions where trial_claimed_by = p_user_id) then
    return jsonb_build_object('allowed', false, 'reason', 'trial_already_used');
  end if;

  select * into v_prev from public.trial_signup_events
   where user_id = p_user_id and consumed_at is null order by created_at desc limit 1;
  if v_prev.id is not null then
    return jsonb_build_object('allowed', v_prev.outcome in ('allowed', 'ip_unknown'), 'reason',
                              case when v_prev.outcome = 'denied_ip_limit' then 'ip_limit' else 'ok' end,
                              'replayed', true, 'limit', v_limit, 'window_hours', v_window);
  end if;

  if p_ip_hash is null then
    -- sem como identificar a conexão: não pune quem pode ser legítimo; fica registrado
    insert into public.trial_signup_events (user_id, ip_hash, outcome) values (p_user_id, repeat('0', 16), 'ip_unknown');
    return jsonb_build_object('allowed', true, 'reason', 'ip_unknown', 'limit', v_limit, 'window_hours', v_window);
  end if;

  select count(distinct e.user_id) into v_count from public.trial_signup_events e
   where e.ip_hash = p_ip_hash and e.outcome = 'allowed' and e.user_id <> p_user_id
     and e.created_at > now() - make_interval(hours => v_window);

  if v_count >= v_limit then
    insert into public.trial_signup_events (user_id, ip_hash, outcome) values (p_user_id, p_ip_hash, 'denied_ip_limit');
    insert into public.audit_logs (company_id, actor_user_id, target_user_id, entity_type, entity_id, action, metadata)
    values (null, null, p_user_id, 'trial_signup', gen_random_uuid(), 'platform.signup.trial_denied',
            jsonb_build_object('limit', v_limit, 'window_hours', v_window, 'ip_ref', left(p_ip_hash, 8), '_origin', 'system'));
    return jsonb_build_object('allowed', false, 'reason', 'ip_limit', 'limit', v_limit, 'window_hours', v_window);
  end if;

  insert into public.trial_signup_events (user_id, ip_hash, outcome) values (p_user_id, p_ip_hash, 'allowed');
  return jsonb_build_object('allowed', true, 'reason', 'ok', 'limit', v_limit, 'window_hours', v_window);
end;
$$;
revoke all on function public.authorize_trial_signup(uuid, text) from public, anon, authenticated;
grant execute on function public.authorize_trial_signup(uuid, text) to service_role;

create or replace function public.get_my_trial_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'denied', coalesce((select e.outcome = 'denied_ip_limit' from public.trial_signup_events e
                         where e.user_id = public.current_profile_user_id() order by e.created_at desc limit 1), false),
    'window_hours', public.platform_setting_int('trial_signup_ip_window_hours', 24));
$$;
revoke all on function public.get_my_trial_status() from public, anon;
grant execute on function public.get_my_trial_status() to authenticated, service_role;

-- create_company_with_owner: o teste grátis só é concedido com autorização registrada pelo servidor.
create or replace function public.create_company_with_owner(p_name text, p_business_type business_type default 'other'::business_type)
returns companies
language plpgsql security definer set search_path to 'public' as $$
declare
  v_user_id uuid := public.current_profile_user_id();
  v_company public.companies;
  v_trial_plan public.plans;
  v_trial_already_used boolean;
  v_trial_authorized boolean;
  v_expires_at timestamptz;
  v_already_has_company boolean;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  -- Serializa chamadas concorrentes desta função para o MESMO usuário (ver migration 017).
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select exists (
    select 1 from public.company_members where user_id = v_user_id
  ) into v_already_has_company;

  if v_already_has_company then
    raise exception 'Este usuário já pertence a uma empresa.';
  end if;

  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'Nome da empresa é obrigatório.';
  end if;

  insert into public.companies (name, business_type)
  values (trim(p_name), coalesce(p_business_type, 'other'))
  returning * into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company.id, v_user_id, 'owner');

  select exists (
    select 1 from public.subscriptions where trial_claimed_by = v_user_id
  ) into v_trial_already_used;

  select exists (
    select 1 from public.trial_signup_events e
     where e.user_id = v_user_id and e.consumed_at is null and e.outcome in ('allowed', 'ip_unknown')
  ) into v_trial_authorized;

  if not v_trial_already_used and v_trial_authorized then
    select * into v_trial_plan from public.plans where code = 'FREE_TRIAL';

    if v_trial_plan.id is not null and v_trial_plan.access_duration_days is not null then
      v_expires_at := now() + (v_trial_plan.access_duration_days || ' days')::interval;

      insert into public.subscriptions (
        company_id, plan_id, status, starts_at, expires_at, trial_claimed_by
      ) values (
        v_company.id, v_trial_plan.id, 'trialing', now(), v_expires_at, v_user_id
      );

      insert into public.company_entitlements (
        company_id, plan_id, status, access_starts_at, access_expires_at,
        max_additional_users, support_enabled, tickets_enabled,
        exclusive_groups_enabled, early_access_enabled
      ) values (
        v_company.id, v_trial_plan.id, 'trialing', now(), v_expires_at,
        v_trial_plan.additional_user_limit, v_trial_plan.support_enabled,
        v_trial_plan.tickets_enabled, v_trial_plan.exclusive_groups_enabled,
        v_trial_plan.early_access_enabled
      );
    end if;
  end if;

  update public.trial_signup_events set consumed_at = now()
   where user_id = v_user_id and consumed_at is null and outcome in ('allowed', 'ip_unknown');

  return v_company;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 10. Checkout: nunca cobra plano de teste nem preço zero/ausente
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.claim_subscription_payment(
  p_company_id uuid, p_plan_id uuid, p_amount numeric, p_currency text default 'BRL'::text, p_stale_seconds integer default 120)
returns table(payment_id uuid, created boolean, has_charge boolean, payment_status subscription_payment_status)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_plan public.plans;
  v_existing public.subscription_payments;
  v_sub_id uuid;
  v_id uuid;
begin
  if p_company_id is null or p_plan_id is null or p_amount is null then
    raise exception 'Parâmetros inválidos.';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Empresa não encontrada.';
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if not found or v_plan.status <> 'active' then
    raise exception 'Plano indisponível.';
  end if;
  if v_plan.price is null or v_plan.price <= 0 or v_plan.trial or v_plan.access_duration_days is null then
    raise exception 'Plano sem preço ou duração fixa.';
  end if;
  -- o valor vem do plano no banco: o chamador só confirma o que leu
  if round(p_amount, 2) <> round(v_plan.price, 2) then
    raise exception 'O valor informado não corresponde ao preço do plano.';
  end if;
  if coalesce(p_currency, '') <> coalesce(v_plan.currency, 'BRL') then
    raise exception 'Moeda diferente da do plano.';
  end if;

  -- serializa as reservas da mesma intenção (empresa + plano)
  perform pg_advisory_xact_lock(hashtext('billing_claim:' || p_company_id::text || ':' || p_plan_id::text));

  select * into v_existing
    from public.subscription_payments
   where company_id = p_company_id and plan_id = p_plan_id
     and provider = 'evopay' and status = 'pending'
   for update;

  if found then
    if v_existing.provider_transaction_id is not null then
      -- cobrança aberta já criada no provedor: reutiliza (mesma intenção)
      return query select v_existing.id, false, true, v_existing.status;
      return;
    end if;
    if v_existing.created_at > now() - make_interval(secs => greatest(coalesce(p_stale_seconds, 120), 30)) then
      -- outra requisição está criando a cobrança agora
      return query select v_existing.id, false, false, v_existing.status;
      return;
    end if;
    -- reserva abandonada antes de chegar ao provedor: libera a vaga para uma nova tentativa
    update public.subscription_payments
       set status = 'failed',
           notes = coalesce(notes || ' | ', '') || 'Reserva abandonada antes de ser criada no provedor.'
     where id = v_existing.id;
  end if;

  select id into v_sub_id from public.subscriptions where company_id = p_company_id;

  insert into public.subscription_payments (company_id, subscription_id, plan_id, provider, status, amount, currency)
  values (p_company_id, v_sub_id, p_plan_id, 'evopay', 'pending', v_plan.price, v_plan.currency)
  returning id into v_id;

  return query select v_id, true, false, 'pending'::public.subscription_payment_status;
end;
$$;

commit;
