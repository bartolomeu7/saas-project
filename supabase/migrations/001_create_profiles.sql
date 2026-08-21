-- =============================================================================
-- Migration: 001_create_profiles.sql
-- Descrição: cria a estrutura inicial de perfis de usuário (profiles),
--            vinculada a auth.users, com RBAC básico (role), status,
--            trigger de criação automática e Row Level Security.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extensões necessárias
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 2. Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('user', 'admin', 'super_admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'user_status') then
    create type public.user_status as enum ('active', 'inactive', 'suspended');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 3. Tabela profiles
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  status public.user_status not null default 'active',
  role public.user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,

  constraint profiles_full_name_length check (
    full_name is null or char_length(full_name) between 1 and 160
  ),
  constraint profiles_email_format check (
    email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )
);

comment on table public.profiles is
  'Perfil público de cada usuário. Nunca armazena senha ou credenciais — isso permanece em auth.users, gerenciado pelo Supabase Auth.';
comment on column public.profiles.role is
  'RBAC básico. Alteração via frontend é bloqueada pela policy de update; só pode ser alterada por rotina administrativa (service_role) ou função dedicada futura.';
comment on column public.profiles.status is
  'Controle de acesso administrativo (active/inactive/suspended). Alteração via frontend é bloqueada pela policy de update.';

-- Índices
create index if not exists profiles_user_id_idx on public.profiles (user_id);
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_status_idx on public.profiles (status);

-- -----------------------------------------------------------------------------
-- 4. updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Trigger: criação automática de profile ao criar usuário em auth.users
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', null),
    new.email,
    'user',
    'active'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- security definer: precisa rodar com privilégios elevados para poder
-- inserir em public.profiles a partir de um trigger em auth.users, mesmo
-- que o usuário recém-criado ainda não tenha uma sessão/JWT válida.
-- search_path fixado para evitar hijacking de funções por schemas maliciosos.

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Leitura: usuário autenticado só pode ver o próprio perfil.
-- (Não há policy para "ver perfil de outros usuários" nesta etapa —
-- isso será tratado no admin, via service_role ou policy dedicada futura.)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (user_id = auth.uid());

-- Inserção: não é permitida via frontend/API pública. A criação do
-- profile é feita exclusivamente pelo trigger on_auth_user_created,
-- que roda como security definer e portanto não passa pelas policies.
-- Nenhuma policy "for insert" é criada aqui de propósito: sem policy de
-- insert, INSERTs vindos de um usuário autenticado (via anon/authenticated
-- role) são negados por padrão.

-- Atualização: usuário autenticado pode atualizar apenas o próprio perfil.
-- A policy garante apenas a posse da linha (ownership); a proteção fina de
-- quais colunas podem mudar (bloquear user_id, role, status) é feita pelo
-- trigger "profiles_protect_restricted_fields" abaixo, que é mais explícito
-- e auditável do que tentar expressar isso dentro do "with check".
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Trigger de defesa em profundidade: mesmo que a policy acima permita o
-- UPDATE por ownership, este trigger impede que role/status/user_id sejam
-- alterados por qualquer sessão que não seja service_role (ex: rotina
-- administrativa futura). O usuário comum tenta atualizar full_name/
-- avatar_url normalmente; qualquer tentativa de mudar campos protegidos
-- é rejeitada com erro explícito.
create or replace function public.protect_profile_restricted_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'Não é permitido alterar user_id.';
  end if;

  if new.role is distinct from old.role then
    raise exception 'Não é permitido alterar a própria role. Essa alteração é restrita ao sistema administrativo.';
  end if;

  if new.status is distinct from old.status then
    raise exception 'Não é permitido alterar o próprio status. Essa alteração é restrita ao sistema administrativo.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_restricted_fields on public.profiles;
create trigger profiles_protect_restricted_fields
  before update on public.profiles
  for each row
  execute function public.protect_profile_restricted_fields();

-- Exclusão: não é permitida via frontend nesta etapa.
-- Nenhuma policy "for delete" é criada — sem policy, DELETE é negado
-- por padrão para usuários autenticados comuns.

-- -----------------------------------------------------------------------------
-- 7. Nota sobre acesso administrativo futuro
-- -----------------------------------------------------------------------------
-- Quando o painel /admin for implementado, o acesso amplo (listar/editar
-- perfis de terceiros, alterar role/status) deve continuar restrito:
--   a) a policies adicionais que checam explicitamente
--      "role in ('admin','super_admin')" do próprio usuário autenticado, e/ou
--      b) a rotas server-side que usam o cliente admin (service_role),
--         nunca ao cliente anon/authenticated do frontend.
-- Nenhuma dessas policies administrativas é criada nesta etapa.
