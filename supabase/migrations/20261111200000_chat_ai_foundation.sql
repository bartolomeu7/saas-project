-- =============================================================================
-- Chat AI — fundação (fase 1 do planejamento docs/chat-ai/01 §6): sessões, mensagens, rascunhos, feedback, uso e
-- configuração por empresa. SÓ guarda o estado da conversa: nenhuma tabela de negócio é tocada aqui.
--
-- Modelo de acesso (decisão de segurança):
--   * Leitura: o PRÓPRIO usuário vê só as suas sessões/mensagens/rascunhos (nem o dono lê as de outro membro).
--   * Escrita: SOMENTE o servidor, com service_role, depois de autenticar e derivar empresa/usuário. `authenticated` não
--     tem INSERT/UPDATE/DELETE nestas tabelas (um cliente mal-intencionado não consegue forjar um rascunho "pronto").
--     A GRAVAÇÃO nos módulos continua sendo pelas funções de sempre, com a sessão do usuário.
--   * Configuração (`chat_settings`): membros leem; só o dono grava.
--   * Áudio: tabela e bucket vêm numa migration própria (fase de voz).
-- Rollback: supabase/rollback/20261111200000_chat_ai_foundation.down.sql
-- Bateria:  tests/sql/chat_ai_foundation.sql (somente TEST).
-- =============================================================================
begin;

-- ---------------------------------------------------------------------------
-- Ajudantes
-- ---------------------------------------------------------------------------
create or replace function public.chat_member_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cm.company_id
  from public.company_members cm
  where cm.user_id = public.current_profile_user_id()
  limit 1
$$;
revoke all on function public.chat_member_company_id() from public, anon;
grant execute on function public.chat_member_company_id() to authenticated, service_role;

create or replace function public.chat_owner_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cm.company_id
  from public.company_members cm
  where cm.user_id = public.current_profile_user_id()
    and cm.role = 'owner'::public.company_role
  limit 1
$$;
revoke all on function public.chat_owner_company_id() from public, anon;
grant execute on function public.chat_owner_company_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Configuração por empresa
-- ---------------------------------------------------------------------------
create table if not exists public.chat_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  enabled boolean not null default false,
  agent_name text not null default 'Cláudia' check (char_length(trim(agent_name)) between 2 and 30),
  modules text[] not null default '{}',
  value_ceiling numeric(12,2) not null default 1000 check (value_ceiling >= 0),
  draft_ttl_minutes integer not null default 30 check (draft_ttl_minutes between 5 and 240),
  retention_days integer not null default 90 check (retention_days between 7 and 730),
  updated_by uuid references public.profiles(user_id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Conversas e mensagens (só texto)
-- ---------------------------------------------------------------------------
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  title text check (title is null or char_length(title) <= 120),
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);
create index if not exists chat_sessions_user_idx on public.chat_sessions (company_id, user_id, last_active_at desc);

create table if not exists public.chat_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  module text not null check (char_length(module) between 2 and 30),
  intent text not null check (char_length(intent) between 3 and 60),
  risk text not null check (risk in ('R0','R1','R2','R3')),
  -- valores já resolvidos (com IDs do banco); NUNCA vão ao modelo de linguagem
  slots jsonb not null default '{}'::jsonb,
  -- o que a pessoa disse (texto bruto por campo)
  raw jsonb not null default '{}'::jsonb,
  missing text[] not null default '{}',
  warnings jsonb not null default '[]'::jsonb,
  blocks jsonb not null default '[]'::jsonb,
  version integer not null default 1 check (version >= 1),
  status text not null default 'coletando'
    check (status in ('coletando','aguardando_confirmacao','executando','concluido','descartado','expirado','falhou')),
  expires_at timestamptz not null,
  executed_at timestamptz,
  result jsonb,
  -- "{draft_id}:v{version}": confirmar duas vezes (duplo clique, retry) grava uma vez
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_drafts_user_idx on public.chat_drafts (company_id, user_id, status, expires_at);
create index if not exists chat_drafts_session_idx on public.chat_drafts (session_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role text not null check (role in ('user','agent')),
  kind text not null default 'text'
    check (kind in ('text','ask','offer','disambiguate','confirm','result','info','error','notice')),
  text text not null check (char_length(text) <= 4000),
  -- texto transcrito quando a mensagem veio por voz (o áudio não fica aqui)
  transcript text check (transcript is null or char_length(transcript) <= 4000),
  input_mode text not null default 'texto' check (input_mode in ('texto','voz')),
  -- cartão estruturado devolvido pela agente
  payload jsonb,
  draft_id uuid references public.chat_drafts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_session_idx on public.chat_messages (session_id, created_at);
create index if not exists chat_messages_retention_idx on public.chat_messages (created_at);

-- Correções e descartes: alimentam a medição de acerto (sem texto de conversa).
create table if not exists public.chat_feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  draft_id uuid references public.chat_drafts(id) on delete set null,
  intent text,
  field text,
  kind text not null check (kind in ('correcao','descarte','falha','expirado','confirmado')),
  created_at timestamptz not null default now()
);
create index if not exists chat_feedback_company_idx on public.chat_feedback (company_id, created_at desc);

-- Uso diário por empresa (cota e custo).
create table if not exists public.chat_usage (
  company_id uuid not null references public.companies(id) on delete cascade,
  day date not null,
  messages integer not null default 0 check (messages >= 0),
  llm_calls integer not null default 0 check (llm_calls >= 0),
  llm_tokens bigint not null default 0 check (llm_tokens >= 0),
  primary key (company_id, day)
);

-- ---------------------------------------------------------------------------
-- RLS + permissões
-- ---------------------------------------------------------------------------
alter table public.chat_settings enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_drafts enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_feedback enable row level security;
alter table public.chat_usage enable row level security;

drop policy if exists chat_settings_select_members on public.chat_settings;
create policy chat_settings_select_members on public.chat_settings for select to authenticated
  using (company_id = (select public.chat_member_company_id()));
drop policy if exists chat_settings_insert_owner on public.chat_settings;
create policy chat_settings_insert_owner on public.chat_settings for insert to authenticated
  with check (company_id = (select public.chat_owner_company_id()));
drop policy if exists chat_settings_update_owner on public.chat_settings;
create policy chat_settings_update_owner on public.chat_settings for update to authenticated
  using (company_id = (select public.chat_owner_company_id()))
  with check (company_id = (select public.chat_owner_company_id()));

drop policy if exists chat_sessions_select_own on public.chat_sessions;
create policy chat_sessions_select_own on public.chat_sessions for select to authenticated
  using (company_id = (select public.chat_member_company_id()) and user_id = (select public.current_profile_user_id()));
drop policy if exists chat_drafts_select_own on public.chat_drafts;
create policy chat_drafts_select_own on public.chat_drafts for select to authenticated
  using (company_id = (select public.chat_member_company_id()) and user_id = (select public.current_profile_user_id()));
drop policy if exists chat_messages_select_own on public.chat_messages;
create policy chat_messages_select_own on public.chat_messages for select to authenticated
  using (company_id = (select public.chat_member_company_id()) and user_id = (select public.current_profile_user_id()));

-- Medição e uso: só dono/administrador da empresa lê (sem conteúdo de conversa).
drop policy if exists chat_feedback_select_managers on public.chat_feedback;
create policy chat_feedback_select_managers on public.chat_feedback for select to authenticated
  using (company_id = (select public.hr_manager_company_id()));
drop policy if exists chat_usage_select_managers on public.chat_usage;
create policy chat_usage_select_managers on public.chat_usage for select to authenticated
  using (company_id = (select public.hr_manager_company_id()));

revoke all on table public.chat_settings, public.chat_sessions, public.chat_drafts, public.chat_messages,
  public.chat_feedback, public.chat_usage from anon;
revoke insert, update, delete, truncate on table public.chat_sessions, public.chat_drafts, public.chat_messages,
  public.chat_feedback, public.chat_usage from authenticated;
revoke delete, truncate on table public.chat_settings from authenticated;
grant select on table public.chat_sessions, public.chat_drafts, public.chat_messages, public.chat_feedback, public.chat_usage, public.chat_settings to authenticated;
grant insert, update on table public.chat_settings to authenticated;
grant all on table public.chat_settings, public.chat_sessions, public.chat_drafts, public.chat_messages,
  public.chat_feedback, public.chat_usage to service_role;

-- ---------------------------------------------------------------------------
-- Rotinas de manutenção (só o servidor chama)
-- ---------------------------------------------------------------------------
-- Rascunhos vencidos que ainda não terminaram viram "expirado" (executando não expira: a gravação está em curso).
create or replace function public.chat_expire_due_drafts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.chat_drafts
     set status = 'expirado', updated_at = now()
   where expires_at <= now()
     and status in ('coletando', 'aguardando_confirmacao', 'falhou');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.chat_expire_due_drafts() from public, anon, authenticated;
grant execute on function public.chat_expire_due_drafts() to service_role;

-- Apaga mensagens mais antigas que a retenção de cada empresa (rascunhos executados mantêm só o resumo).
create or replace function public.chat_purge_old_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  delete from public.chat_messages m
   using (select c.id as company_id, coalesce(s.retention_days, 90) as days
            from public.companies c left join public.chat_settings s on s.company_id = c.id) r
   where m.company_id = r.company_id
     and m.created_at < now() - make_interval(days => r.days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.chat_purge_old_messages() from public, anon, authenticated;
grant execute on function public.chat_purge_old_messages() to service_role;

comment on table public.chat_drafts is
  'Rascunho de uma ordem do Chat AI. O servidor guarda; o botão Confirmar só envia (id, versão, chave). Escrita só por service_role.';

commit;
