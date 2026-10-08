-- =============================================================================
-- Documentos legais versionados + histórico auditável de consentimento (somente TEST nesta fase)
--
-- 1. legal_document_versions: cada versão publicada de TERMS_OF_USE / PRIVACY_POLICY, com o
--    hash SHA-256 do conteúdo efetivamente publicado (src/lib/legal/hash.ts). Versão publicada
--    é imutável: mudou o texto → NOVA versão (nova linha), nunca UPDATE do hash/versão.
-- 2. user_consents: histórico APPEND-ONLY. Um registro por documento e por aceite (aceite dos
--    Termos e ciência da Política são registros separados). Nunca é editado nem apagado.
-- 3. RPCs SECURITY DEFINER: a identidade vem SEMPRE do JWT (current_profile_user_id()); o cliente
--    não informa user_id e não escolhe versão: ele só confirma a versão que viu, e o servidor
--    recusa se não for a vigente. Timestamp = relógio do servidor.
--
-- Nenhuma tabela é aberta ao cliente: RLS ligada, sem policy, sem grant. Só as RPCs acessam.
-- Não grava IP nem user-agent (sem finalidade documentada que justifique a coleta).
-- =============================================================================

create table if not exists public.legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('TERMS_OF_USE', 'PRIVACY_POLICY')),
  version text not null check (char_length(version) between 1 and 40),
  effective_at timestamptz not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'published' check (status in ('draft', 'published', 'retired')),
  created_at timestamptz not null default now(),
  unique (document_type, version)
);
alter table public.legal_document_versions enable row level security;
revoke all on table public.legal_document_versions from anon, authenticated;

-- Versão publicada é imutável: só pode ser aposentada (published -> retired).
create or replace function public.legal_document_versions_guard()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Versão de documento legal publicada não pode ser apagada.';
    end if;
    return old;
  end if;

  if old.status <> 'draft' then
    if new.document_type is distinct from old.document_type
       or new.version is distinct from old.version
       or new.effective_at is distinct from old.effective_at
       or new.content_hash is distinct from old.content_hash
       or new.created_at is distinct from old.created_at then
      raise exception 'Versão de documento legal publicada é imutável: publique uma nova versão.';
    end if;
    if not (old.status = new.status or (old.status = 'published' and new.status = 'retired')) then
      raise exception 'Transição de status inválida para documento legal.';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function public.legal_document_versions_guard() from public, anon, authenticated;

drop trigger if exists legal_document_versions_guard_trigger on public.legal_document_versions;
create trigger legal_document_versions_guard_trigger
  before update or delete on public.legal_document_versions
  for each row execute function public.legal_document_versions_guard();

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id),
  consent_type text not null check (consent_type in ('TERMS_OF_USE_ACCEPTANCE', 'PRIVACY_POLICY_ACKNOWLEDGEMENT')),
  document_type text not null check (document_type in ('TERMS_OF_USE', 'PRIVACY_POLICY')),
  document_version_id uuid not null references public.legal_document_versions(id),
  document_hash text not null check (document_hash ~ '^[0-9a-f]{64}$'),
  granted boolean not null default true,
  granted_at timestamptz not null default now(),
  context text not null check (context in ('SIGNUP', 'REACCEPTANCE', 'ACCEPTANCE_GATE')),
  created_at timestamptz not null default now(),
  constraint user_consents_type_matches_document check (
    (consent_type = 'TERMS_OF_USE_ACCEPTANCE' and document_type = 'TERMS_OF_USE')
    or (consent_type = 'PRIVACY_POLICY_ACKNOWLEDGEMENT' and document_type = 'PRIVACY_POLICY')
  )
);
alter table public.user_consents enable row level security;
revoke all on table public.user_consents from anon, authenticated;
create index if not exists idx_user_consents_user_doc on public.user_consents (user_id, document_type, granted_at desc);
create index if not exists idx_user_consents_version on public.user_consents (document_version_id);

-- Append-only: nenhum papel (inclusive service_role) edita ou apaga histórico.
create or replace function public.user_consents_append_only()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  raise exception 'user_consents é append-only: o histórico de consentimento não pode ser alterado nem apagado.';
end;
$function$;
revoke all on function public.user_consents_append_only() from public, anon, authenticated;

drop trigger if exists user_consents_append_only_trigger on public.user_consents;
create trigger user_consents_append_only_trigger
  before update or delete on public.user_consents
  for each row execute function public.user_consents_append_only();

drop trigger if exists user_consents_no_truncate_trigger on public.user_consents;
create trigger user_consents_no_truncate_trigger
  before truncate on public.user_consents
  for each statement execute function public.user_consents_append_only();

-- Versão vigente de um documento: a publicada, já em vigor, de vigência mais recente.
create or replace function public.legal_current_version(p_type text)
 returns public.legal_document_versions
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select v.*
    from public.legal_document_versions v
   where v.document_type = p_type
     and v.status = 'published'
     and v.effective_at <= now()
   order by v.effective_at desc, v.created_at desc
   limit 1;
$function$;
revoke all on function public.legal_current_version(text) from public, anon, authenticated;

-- Lista pública das versões vigentes (informação pública; usada na tela de cadastro antes do login).
create or replace function public.get_current_legal_documents()
 returns table (document_type text, version text, effective_at timestamptz, content_hash text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select d.document_type, c.version, c.effective_at, c.content_hash
    from (values ('TERMS_OF_USE'), ('PRIVACY_POLICY')) as d(document_type)
    cross join lateral public.legal_current_version(d.document_type) c
   where c.id is not null
   order by d.document_type;
$function$;
revoke all on function public.get_current_legal_documents() from public;
grant execute on function public.get_current_legal_documents() to anon, authenticated;

-- Situação do usuário atual: quais documentos vigentes ainda não têm aceite concedido.
create or replace function public.get_my_legal_consent_status()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := public.current_profile_user_id();
  v_pending jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'document_type', c.document_type, 'version', c.version,
           'effective_at', c.effective_at, 'content_hash', c.content_hash) order by c.document_type), '[]'::jsonb)
    into v_pending
    from (select (public.legal_current_version(t.document_type)).*
            from (values ('TERMS_OF_USE'), ('PRIVACY_POLICY')) as t(document_type)) c
   where c.id is not null
     and coalesce((
       select uc.granted
         from public.user_consents uc
        where uc.user_id = v_uid and uc.document_type = c.document_type and uc.document_version_id = c.id
        order by uc.granted_at desc, uc.created_at desc
        limit 1), false) is not true;

  return jsonb_build_object('complete', jsonb_array_length(v_pending) = 0, 'pending', v_pending);
end;
$function$;
revoke all on function public.get_my_legal_consent_status() from public, anon;
grant execute on function public.get_my_legal_consent_status() to authenticated;

-- Registra o aceite dos dois documentos vigentes. O cliente só CONFIRMA as versões que viu.
create or replace function public.record_legal_consent(
  p_terms_version text,
  p_privacy_version text,
  p_context text default 'ACCEPTANCE_GATE'
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := public.current_profile_user_id();
  v_terms public.legal_document_versions;
  v_privacy public.legal_document_versions;
  v_recorded integer := 0;
  v_doc public.legal_document_versions;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_context is null or p_context not in ('SIGNUP', 'REACCEPTANCE', 'ACCEPTANCE_GATE') then
    raise exception 'Contexto de aceite inválido.';
  end if;

  v_terms := public.legal_current_version('TERMS_OF_USE');
  v_privacy := public.legal_current_version('PRIVACY_POLICY');
  if v_terms.id is null or v_privacy.id is null then
    raise exception 'Documento legal não vigente.';
  end if;

  if p_terms_version is distinct from v_terms.version or p_privacy_version is distinct from v_privacy.version then
    raise exception 'A versão dos documentos mudou. Recarregue a página e leia a versão vigente.';
  end if;

  -- serializa por usuário: duas chamadas simultâneas não duplicam o histórico
  perform pg_advisory_xact_lock(hashtext('legal_consent:' || v_uid::text));

  foreach v_doc in array array[v_terms, v_privacy] loop
    if coalesce((
         select uc.granted from public.user_consents uc
          where uc.user_id = v_uid and uc.document_type = v_doc.document_type and uc.document_version_id = v_doc.id
          order by uc.granted_at desc, uc.created_at desc limit 1), false) is not true then
      insert into public.user_consents (user_id, consent_type, document_type, document_version_id, document_hash, granted, context)
      values (
        v_uid,
        case v_doc.document_type when 'TERMS_OF_USE' then 'TERMS_OF_USE_ACCEPTANCE' else 'PRIVACY_POLICY_ACKNOWLEDGEMENT' end,
        v_doc.document_type, v_doc.id, v_doc.content_hash, true, p_context
      );
      v_recorded := v_recorded + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'terms_version', v_terms.version, 'privacy_version', v_privacy.version, 'recorded', v_recorded
  );
end;
$function$;
revoke all on function public.record_legal_consent(text, text, text) from public, anon;
grant execute on function public.record_legal_consent(text, text, text) to authenticated;

-- Histórico do próprio usuário (nunca de outro).
create or replace function public.get_my_legal_consent_history()
 returns table (
  consent_type text, document_type text, version text, document_hash text,
  granted boolean, granted_at timestamptz, context text
 )
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := public.current_profile_user_id();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  return query
  select uc.consent_type, uc.document_type, v.version, uc.document_hash, uc.granted, uc.granted_at, uc.context
    from public.user_consents uc
    join public.legal_document_versions v on v.id = uc.document_version_id
   where uc.user_id = v_uid
   order by uc.granted_at desc, uc.created_at desc;
end;
$function$;
revoke all on function public.get_my_legal_consent_history() from public, anon;
grant execute on function public.get_my_legal_consent_history() to authenticated;

-- Versões iniciais (release candidate para TEST). Hash = SHA-256 do conteúdo canônico em
-- src/content/legal/* (teste unitário garante que estes valores batem com o texto do repositório).
insert into public.legal_document_versions (document_type, version, effective_at, content_hash, status)
values
  ('TERMS_OF_USE', '1.0.0-rc.1', '2026-10-08T00:00:00-03:00', 'd243919eb1e4fd3b0550cf15f3ebb78e4ac3bb04c4dfea96d98c8407e968f6e4', 'published'),
  ('PRIVACY_POLICY', '1.0.0-rc.1', '2026-10-08T00:00:00-03:00', 'f48a06631470dd62242e265cc4e44ec713e1e18ce0bde1df969cbaf8275a5bb0', 'published')
on conflict (document_type, version) do nothing;
