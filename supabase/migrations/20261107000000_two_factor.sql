-- =============================================================================
-- Verificação em duas etapas PRÓPRIA do Prime Ges (aplicativo autenticador, TOTP), independente do plano do Clerk.
--
-- O Clerk continua provando QUEM é a pessoa (e-mail/senha/conta social). Esta camada é a segunda etapa DO PRODUTO: quem
-- ativou, precisa digitar o código do aplicativo (ou um código de backup) uma vez por sessão do Clerk para usar /app e
-- /admin. A barreira fica no middleware (páginas, Server Actions e APIs), no mesmo padrão do aceite dos termos e do limite
-- de sessões.
--
--   * user_two_factor ................ segredo TOTP CIFRADO pela aplicação (AES-256-GCM; a chave nunca vai ao banco),
--                                     estado, proteção contra reuso do mesmo código e bloqueio por tentativas erradas;
--   * user_two_factor_backup_codes ... só o HASH dos códigos de backup (uso único);
--   * two_factor_session_verifications  sessões do Clerk que já passaram pela segunda etapa;
--   * two_factor_gate_status(sid) .... leitura barata do middleware, com o token do próprio usuário;
--   * two_factor_reserve_attempt ..... limite de tentativas atômico (5 erradas = bloqueio de 15 min), só service_role;
--   * admin_reset_two_factor(uid) .... recuperação por super administrador (perdeu aparelho e códigos), com auditoria.
--
-- As três tabelas NÃO têm policy e nenhum privilégio para anon/authenticated: só service_role (Server Actions) escreve e lê.
-- Rollback: supabase/rollback/20261107000000_two_factor.down.sql
-- =============================================================================
begin;

create table if not exists public.user_two_factor (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  secret_enc text not null,
  enabled boolean not null default false,
  enabled_at timestamptz,
  last_used_step bigint not null default 0,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_two_factor_backup_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, code_hash)
);
create index if not exists user_two_factor_backup_codes_user_idx on public.user_two_factor_backup_codes (user_id);

create table if not exists public.two_factor_session_verifications (
  clerk_session_id text primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  verified_at timestamptz not null default now()
);
create index if not exists two_factor_session_verifications_user_idx on public.two_factor_session_verifications (user_id);
create index if not exists two_factor_session_verifications_age_idx on public.two_factor_session_verifications (verified_at);

alter table public.user_two_factor enable row level security;
alter table public.user_two_factor_backup_codes enable row level security;
alter table public.two_factor_session_verifications enable row level security;

revoke all on table public.user_two_factor from public, anon, authenticated;
revoke all on table public.user_two_factor_backup_codes from public, anon, authenticated;
revoke all on table public.two_factor_session_verifications from public, anon, authenticated;
grant all on table public.user_two_factor to service_role;
grant all on table public.user_two_factor_backup_codes to service_role;
grant all on table public.two_factor_session_verifications to service_role;

drop trigger if exists user_two_factor_set_updated_at on public.user_two_factor;
create trigger user_two_factor_set_updated_at
  before update on public.user_two_factor
  for each row execute function public.set_updated_at();

comment on table public.user_two_factor is
  'Segundo fator TOTP do Prime Ges. secret_enc é cifrado pela aplicação (AES-256-GCM). Só service_role acessa.';
comment on table public.user_two_factor_backup_codes is
  'Códigos de backup da segunda etapa: só o hash, uso único. Só service_role acessa.';
comment on table public.two_factor_session_verifications is
  'Sessões do Clerk que já passaram pela segunda etapa. Só service_role acessa.';

-- ------------------------------------------------------------ two_factor_gate_status
-- Lida pelo middleware com o token do próprio usuário. required = tem segunda etapa ativa; verified = ESTA sessão do
-- Clerk já a cumpriu. Sem perfil (primeiro acesso) ou sem segunda etapa: nada é exigido.
create or replace function public.two_factor_gate_status(p_session_id text)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_user uuid := public.current_profile_user_id();
  v_required boolean;
  v_verified boolean;
begin
  if v_user is null then
    return jsonb_build_object('required', false, 'verified', true);
  end if;

  select exists (select 1 from public.user_two_factor where user_id = v_user and enabled) into v_required;
  if not v_required then
    return jsonb_build_object('required', false, 'verified', true);
  end if;

  select exists (
    select 1 from public.two_factor_session_verifications
    where clerk_session_id = p_session_id and user_id = v_user
  ) into v_verified;

  return jsonb_build_object('required', true, 'verified', v_verified);
end;
$function$;

revoke all on function public.two_factor_gate_status(text) from public, anon;
grant execute on function public.two_factor_gate_status(text) to authenticated, service_role;

-- ------------------------------------------------------------ two_factor_reserve_attempt
-- Limite de tentativas ATÔMICO (só service_role). Cada tentativa de código "reserva" uma falha ANTES de conferir o
-- código (a linha fica travada com FOR UPDATE, então tentativas simultâneas se enfileiram): na 5ª tentativa sem sucesso
-- a conta fica bloqueada por 15 minutos. Quem acerta zera o contador pela aplicação. Devolve NULL se a tentativa pode
-- seguir, ou até quando está bloqueado. Assim, mesmo 1000 pedidos em paralelo conferem no máximo 5 códigos por janela.
create or replace function public.two_factor_reserve_attempt(p_user_id uuid)
 returns timestamptz
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v public.user_two_factor;
  v_failed integer;
begin
  select * into v from public.user_two_factor where user_id = p_user_id for update;
  if not found then
    raise exception 'two_factor_not_configured';
  end if;

  if v.locked_until is not null and v.locked_until > now() then
    return v.locked_until;
  end if;

  v_failed := case when v.locked_until is not null then 0 else v.failed_attempts end;  -- bloqueio expirou: recomeça
  update public.user_two_factor
     set failed_attempts = v_failed + 1,
         locked_until = case when v_failed + 1 >= 5 then now() + interval '15 minutes' else null end
   where user_id = p_user_id;
  return null;
end;
$function$;

revoke all on function public.two_factor_reserve_attempt(uuid) from public, anon, authenticated;
grant execute on function public.two_factor_reserve_attempt(uuid) to service_role;

-- ------------------------------------------------------------ admin_reset_two_factor
-- SUPER_ADMIN ONLY. Remove a segunda etapa de OUTRA pessoa que perdeu o aparelho e os códigos de backup. Ninguém
-- remove a própria por aqui (quem tem a sessão aberta usa a tela de Segurança, que exige um código). Audita.
create or replace function public.admin_reset_two_factor(p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor uuid := public.current_profile_user_id();
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;
  if p_user_id is null or not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'Usuário não encontrado.';
  end if;
  if p_user_id = v_actor then
    raise exception 'Você não pode remover a própria verificação em duas etapas por aqui.';
  end if;

  delete from public.two_factor_session_verifications where user_id = p_user_id;
  delete from public.user_two_factor_backup_codes where user_id = p_user_id;
  delete from public.user_two_factor where user_id = p_user_id;

  perform public.write_platform_audit_log(
    'platform.user.two_factor_reset', 'user', p_user_id, null, p_user_id, '{}'::jsonb
  );
end;
$function$;

revoke all on function public.admin_reset_two_factor(uuid) from public, anon;
grant execute on function public.admin_reset_two_factor(uuid) to authenticated, service_role;

commit;
