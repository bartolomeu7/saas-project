-- Orçamento, Fase 0: dados cadastrais da empresa, logo e padrões do orçamento.
--
-- Um orçamento em PDF precisa mostrar quem emite: razão social, CNPJ/CPF, telefone, e-mail, endereço e logo. Até aqui a empresa só tinha
-- nome e segmento. Esta migration adiciona (tudo opcional, nada muda para quem não preencher):
--   * companies: razão social, documento, telefone, WhatsApp, e-mail, site e endereço
--   * company_logos: o logo (imagem pequena, guardada em base64 no banco; o servidor local não tem serviço de arquivos)
--   * company_settings.operational_preferences.quote: validade padrão, condições de pagamento e rodapé dos orçamentos
-- Escrita só por funções SECURITY DEFINER para dono/administrador da empresa (padrão do projeto), com auditoria.
-- Leitura: qualquer membro da empresa (RLS). Reversão: supabase/rollback/20261121100000_*.down.sql
begin;

-- ------------------------------------------------------------------ dados cadastrais
alter table public.companies
  add column if not exists legal_name text,
  add column if not exists document text,
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists email text,
  add column if not exists website text,
  add column if not exists postal_code text,
  add column if not exists address text,
  add column if not exists address_number text,
  add column if not exists complement text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_profile_lengths') then
    alter table public.companies add constraint companies_profile_lengths check (
      (legal_name is null or char_length(legal_name) <= 180) and
      (document is null or char_length(document) <= 32) and
      (phone is null or char_length(phone) <= 32) and
      (whatsapp is null or char_length(whatsapp) <= 32) and
      (email is null or char_length(email) <= 160) and
      (website is null or char_length(website) <= 160) and
      (postal_code is null or char_length(postal_code) <= 16) and
      (address is null or char_length(address) <= 200) and
      (address_number is null or char_length(address_number) <= 20) and
      (complement is null or char_length(complement) <= 100) and
      (neighborhood is null or char_length(neighborhood) <= 100) and
      (city is null or char_length(city) <= 100) and
      (state is null or char_length(state) = 2)
    );
  end if;
end
$constraints$;

-- ------------------------------------------------------------------ logo
create table if not exists public.company_logos (
  company_id uuid primary key references public.companies(id) on delete cascade,
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes integer not null check (size_bytes between 100 and 524288),
  data_base64 text not null check (char_length(data_base64) <= 720000 and data_base64 ~ '^[A-Za-z0-9+/]+={0,2}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(user_id) on delete set null
);

alter table public.company_logos enable row level security;
revoke all on table public.company_logos from public, anon;
revoke insert, update, delete on table public.company_logos from authenticated;
grant select on table public.company_logos to authenticated;

drop policy if exists company_logos_select_member on public.company_logos;
create policy company_logos_select_member on public.company_logos for select to authenticated
  using (exists (
    select 1 from public.company_members cm
    where cm.company_id = company_logos.company_id
      and cm.user_id = (select public.current_profile_user_id())
  ));

-- ------------------------------------------------------------------ função interna: empresa e papel do usuário atual
create or replace function public._company_editor()
returns table (user_id uuid, company_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := public.current_profile_user_id();
  v_company uuid;
  v_role public.company_role;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  select cm.company_id, cm.role into v_company, v_role
    from public.company_members cm
   where cm.user_id = v_user
   order by cm.created_at asc
   limit 1;
  if v_company is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'Apenas o proprietário ou um administrador da empresa podem alterar estes dados.';
  end if;
  return query select v_user, v_company;
end;
$function$;

-- ------------------------------------------------------------------ dados cadastrais
create or replace function public.update_company_profile(
  p_legal_name text, p_document text, p_phone text, p_whatsapp text, p_email text, p_website text,
  p_postal_code text, p_address text, p_address_number text, p_complement text, p_neighborhood text, p_city text, p_state text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_company uuid;
  v_state text := nullif(upper(btrim(coalesce(p_state, ''))), '');
begin
  select e.user_id, e.company_id into v_user, v_company from public._company_editor() e;

  if v_state is not null and v_state not in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO') then
    raise exception 'UF inválida (use a sigla, ex.: SP).';
  end if;
  if nullif(btrim(coalesce(p_email, '')), '') is not null and btrim(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;
  if nullif(btrim(coalesce(p_postal_code, '')), '') is not null and regexp_replace(p_postal_code, '\D', '', 'g') !~ '^\d{8}$' then
    raise exception 'CEP inválido: use 8 números.';
  end if;
  if nullif(btrim(coalesce(p_website, '')), '') is not null and btrim(p_website) !~* '^https?://[^\s]+$' then
    raise exception 'O site deve começar com http:// ou https://.';
  end if;

  update public.companies set
    legal_name = nullif(btrim(coalesce(p_legal_name, '')), ''),
    document = nullif(btrim(coalesce(p_document, '')), ''),
    phone = nullif(btrim(coalesce(p_phone, '')), ''),
    whatsapp = nullif(btrim(coalesce(p_whatsapp, '')), ''),
    email = nullif(lower(btrim(coalesce(p_email, ''))), ''),
    website = nullif(btrim(coalesce(p_website, '')), ''),
    postal_code = nullif(btrim(coalesce(p_postal_code, '')), ''),
    address = nullif(btrim(coalesce(p_address, '')), ''),
    address_number = nullif(btrim(coalesce(p_address_number, '')), ''),
    complement = nullif(btrim(coalesce(p_complement, '')), ''),
    neighborhood = nullif(btrim(coalesce(p_neighborhood, '')), ''),
    city = nullif(btrim(coalesce(p_city, '')), ''),
    state = v_state
  where id = v_company;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'company', v_company, 'company.profile_updated',
          jsonb_build_object('has_document', nullif(btrim(coalesce(p_document, '')), '') is not null,
                             'has_address', nullif(btrim(coalesce(p_address, '')), '') is not null));
end;
$function$;

-- ------------------------------------------------------------------ logo
create or replace function public.set_company_logo(p_content_type text, p_data_base64 text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_company uuid;
  v_bytes integer;
  v_raw bytea;
begin
  select e.user_id, e.company_id into v_user, v_company from public._company_editor() e;

  if p_content_type is null or p_content_type not in ('image/png', 'image/jpeg', 'image/webp') then
    raise exception 'Use uma imagem PNG, JPG ou WEBP.';
  end if;
  if p_data_base64 is null or char_length(p_data_base64) > 720000 or p_data_base64 !~ '^[A-Za-z0-9+/]+={0,2}$' then
    raise exception 'Imagem inválida ou grande demais (máximo 512 KB).';
  end if;
  v_raw := decode(p_data_base64, 'base64');
  v_bytes := octet_length(v_raw);
  if v_bytes < 100 or v_bytes > 524288 then
    raise exception 'Imagem inválida ou grande demais (máximo 512 KB).';
  end if;
  -- o conteúdo precisa ser mesmo do tipo declarado (assinatura do arquivo), não só o nome: defesa em profundidade
  if not (
       (p_content_type = 'image/png' and substring(v_raw from 1 for 8) = '\x89504e470d0a1a0a'::bytea)
    or (p_content_type = 'image/jpeg' and substring(v_raw from 1 for 3) = '\xffd8ff'::bytea)
    or (p_content_type = 'image/webp' and substring(v_raw from 1 for 4) = '\x52494646'::bytea and substring(v_raw from 9 for 4) = '\x57454250'::bytea)
  ) then
    raise exception 'O arquivo não é uma imagem %.', upper(substring(p_content_type from 7));
  end if;

  insert into public.company_logos (company_id, content_type, size_bytes, data_base64, updated_at, updated_by)
  values (v_company, p_content_type, v_bytes, p_data_base64, now(), v_user)
  on conflict (company_id) do update
    set content_type = excluded.content_type, size_bytes = excluded.size_bytes, data_base64 = excluded.data_base64,
        updated_at = now(), updated_by = excluded.updated_by;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'company', v_company, 'company.logo_updated', jsonb_build_object('content_type', p_content_type, 'size_bytes', v_bytes));
end;
$function$;

create or replace function public.remove_company_logo()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_company uuid;
begin
  select e.user_id, e.company_id into v_user, v_company from public._company_editor() e;
  delete from public.company_logos where company_id = v_company;
  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'company', v_company, 'company.logo_removed', '{}'::jsonb);
end;
$function$;

-- ------------------------------------------------------------------ padrões do orçamento
create or replace function public.update_company_quote_defaults(p_validity_days integer, p_payment_terms text, p_footer text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_company uuid;
  v_terms text := nullif(btrim(coalesce(p_payment_terms, '')), '');
  v_footer text := nullif(btrim(coalesce(p_footer, '')), '');
begin
  select e.user_id, e.company_id into v_user, v_company from public._company_editor() e;

  if p_validity_days is null or p_validity_days < 1 or p_validity_days > 365 then
    raise exception 'A validade padrão deve ser de 1 a 365 dias.';
  end if;
  if v_terms is not null and char_length(v_terms) > 1000 then
    raise exception 'As condições de pagamento podem ter no máximo 1000 caracteres.';
  end if;
  if v_footer is not null and char_length(v_footer) > 300 then
    raise exception 'O rodapé pode ter no máximo 300 caracteres.';
  end if;

  insert into public.company_settings (company_id, updated_by) values (v_company, v_user) on conflict (company_id) do nothing;

  update public.company_settings
     set operational_preferences = jsonb_set(
           coalesce(operational_preferences, '{}'::jsonb), '{quote}',
           jsonb_build_object('validity_days', p_validity_days, 'payment_terms', v_terms, 'footer', v_footer), true),
         updated_at = now(), updated_by = v_user
   where company_id = v_company;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'company', v_company, 'company.quote_defaults_updated', jsonb_build_object('validity_days', p_validity_days));
end;
$function$;

-- ------------------------------------------------------------------ permissões
revoke all on function public._company_editor() from public, anon, authenticated;
revoke all on function public.update_company_profile(text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.set_company_logo(text, text) from public, anon;
revoke all on function public.remove_company_logo() from public, anon;
revoke all on function public.update_company_quote_defaults(integer, text, text) from public, anon;
grant execute on function public.update_company_profile(text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.set_company_logo(text, text) to authenticated, service_role;
grant execute on function public.remove_company_logo() to authenticated, service_role;
grant execute on function public.update_company_quote_defaults(integer, text, text) to authenticated, service_role;

-- o PostgREST só enxerga funções novas depois de recarregar o cache de esquema
notify pgrst, 'reload schema';

commit;
