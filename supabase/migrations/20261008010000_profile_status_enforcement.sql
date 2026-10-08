-- =============================================================================
-- profiles.status como regra REAL de acesso
--
-- Antes: status só era checado para acesso administrativo (is_platform_admin()).
-- Um usuário suspenso/inativo continuava usando o produto (RLS e RPCs ignoravam
-- o status). Agora a decisão vive num ponto único do banco:
--
--   current_profile_user_id() devolve o user_id interno SOMENTE se o perfil do
--   Clerk user (JWT sub) está status = 'active'; senão devolve NULL.
--
-- Como as 87 policies e 42 funções do app identificam o usuário por essa função,
-- um perfil suspenso/inativo passa a ser negado em tudo (RLS, RPCs, onboarding,
-- billing), inclusive em chamadas diretas à API com o próprio token. O Clerk segue
-- sendo só identidade/sessão; o Prime Ges decide o acesso.
--
-- Regra única: status != active bloqueia o produto (/app, /onboarding) E o painel
-- (/admin), qualquer que seja o papel. O papel nunca contorna o status.
-- =============================================================================

-- ------------------------------------------------ current_profile_user_id()
create or replace function public.current_profile_user_id()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.user_id
  from public.profiles p
  where p.clerk_user_id = (auth.jwt() ->> 'sub')
    and p.status = 'active'
  limit 1
$function$;

-- ------------------------------------------------------------ ensure_profile()
-- Um perfil existente que não está ativo NÃO devolve identidade (retorna NULL),
-- e nunca é recriado nem reativado. Primeiro acesso continua criando perfil ativo.
create or replace function public.ensure_profile(p_full_name text, p_email text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sub text := auth.jwt() ->> 'sub';
  v_user_id uuid;
begin
  if v_sub is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if p_full_name is not null and char_length(p_full_name) not between 1 and 160 then
    raise exception 'Nome invalido.';
  end if;

  if p_email is not null and p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail invalido.';
  end if;

  insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status)
  values (gen_random_uuid(), v_sub, p_full_name, p_email, 'user', 'active')
  on conflict (clerk_user_id) do nothing
  returning user_id into v_user_id;

  if v_user_id is null then
    select p.user_id into v_user_id
    from public.profiles p
    where p.clerk_user_id = v_sub
      and p.status = 'active';
  end if;

  return v_user_id;
end;
$function$;

-- ------------------------------------------------------ leitura do PRÓPRIO perfil
-- O app precisa ler o próprio status mesmo quando ele não é active (middleware e
-- página de acesso indisponível). A leitura passa a casar por clerk_user_id, que
-- não depende de current_profile_user_id(). Continua sendo só a própria linha; o
-- UPDATE próprio segue pelo caminho ativo (profiles_update_own) e protegido pela trigger.
alter policy profiles_select_own on public.profiles
  using (clerk_user_id = (select auth.jwt() ->> 'sub'));

-- ----------------------------------------------- último super_admin ativo (backstop)
-- A plataforma nunca pode ficar sem super_admin ativo. Já era checado nas RPCs;
-- esta trigger garante a invariante NA TABELA — vale para RPC, service_role e SQL
-- direto — para suspender, inativar, rebaixar ou remover. Serializa com o mesmo
-- advisory lock das RPCs, então duas transações concorrentes não conseguem, juntas,
-- zerar os super_admins ativos.
create or replace function public.protect_last_super_admin()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_was_active_super boolean := old.role = 'super_admin' and old.status = 'active';
  v_stays_active_super boolean;
begin
  if tg_op = 'DELETE' then
    v_stays_active_super := false;
  else
    v_stays_active_super := new.role = 'super_admin' and new.status = 'active';
  end if;

  if v_was_active_super and not v_stays_active_super then
    perform pg_advisory_xact_lock(hashtext('platform_admin_roles'));

    if not exists (
      select 1
      from public.profiles p
      where p.role = 'super_admin'
        and p.status = 'active'
        and p.user_id <> old.user_id
    ) then
      raise exception 'A plataforma precisa manter ao menos um super_admin ativo.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

drop trigger if exists profiles_protect_last_super_admin on public.profiles;

create trigger profiles_protect_last_super_admin
  before update of role, status or delete on public.profiles
  for each row execute function public.protect_last_super_admin();
