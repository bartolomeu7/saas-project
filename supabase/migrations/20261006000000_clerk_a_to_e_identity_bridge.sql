-- Clerk cutover, Migrations A-E (ponte de identidade Clerk -> profiles.user_id).
-- Já aplicadas e validadas no Supabase TESTE (clerk_phase4_a/b/c, clerk_phase5a_d,
-- clerk_phase5c_e); este arquivo reúne as mesmas mudanças para a Produção.
-- Tudo roda numa única transação (falha = nada é aplicado).

-- ---------------------------------------------------------------- A
alter table public.profiles add column if not exists clerk_user_id text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_clerk_user_id_key') then
    alter table public.profiles add constraint profiles_clerk_user_id_key unique (clerk_user_id);
  end if;
end $$;

-- ---------------------------------------------------------------- B
create or replace function public.current_profile_user_id()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.user_id
  from public.profiles p
  where p.clerk_user_id = (auth.jwt() ->> 'sub')
  limit 1
$function$;

revoke all on function public.current_profile_user_id() from public, anon;
grant execute on function public.current_profile_user_id() to authenticated;
grant execute on function public.current_profile_user_id() to service_role;

-- ---------------------------------------------------------------- C
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
    where p.clerk_user_id = v_sub;
  end if;

  return v_user_id;
end;
$function$;

revoke all on function public.ensure_profile(text, text) from public, anon;
grant execute on function public.ensure_profile(text, text) to authenticated;
grant execute on function public.ensure_profile(text, text) to service_role;

-- ---------------------------------------------------------------- D
-- profiles.user_id deixa de referenciar auth.users; as 20 FKs internas passam
-- a referenciar profiles(user_id), preservando o ON DELETE original de cada uma.
alter table public.profiles drop constraint if exists profiles_user_id_fkey;

alter table public.accounts_payable      drop constraint accounts_payable_created_by_fkey,      add constraint accounts_payable_created_by_fkey      foreign key (created_by)          references public.profiles(user_id);
alter table public.appointments          drop constraint appointments_created_by_fkey,          add constraint appointments_created_by_fkey          foreign key (created_by)          references public.profiles(user_id) on delete set null;
alter table public.audit_logs            drop constraint audit_logs_actor_user_id_fkey,         add constraint audit_logs_actor_user_id_fkey         foreign key (actor_user_id)       references public.profiles(user_id) on delete set null;
alter table public.cash_movements        drop constraint cash_movements_created_by_fkey,        add constraint cash_movements_created_by_fkey        foreign key (created_by)          references public.profiles(user_id);
alter table public.cash_registers        drop constraint cash_registers_closed_by_fkey,         add constraint cash_registers_closed_by_fkey         foreign key (closed_by)           references public.profiles(user_id);
alter table public.cash_registers        drop constraint cash_registers_opened_by_fkey,         add constraint cash_registers_opened_by_fkey         foreign key (opened_by)           references public.profiles(user_id);
alter table public.company_members       drop constraint company_members_user_id_fkey,          add constraint company_members_user_id_fkey          foreign key (user_id)             references public.profiles(user_id) on delete cascade;
alter table public.company_settings      drop constraint company_settings_updated_by_fkey,      add constraint company_settings_updated_by_fkey      foreign key (updated_by)          references public.profiles(user_id) on delete set null;
alter table public.customer_documents    drop constraint customer_documents_uploaded_by_fkey,   add constraint customer_documents_uploaded_by_fkey   foreign key (uploaded_by)         references public.profiles(user_id) on delete set null;
alter table public.customer_raffles      drop constraint customer_raffles_executed_by_fkey,     add constraint customer_raffles_executed_by_fkey     foreign key (executed_by)         references public.profiles(user_id);
alter table public.financial_entries     drop constraint financial_entries_created_by_fkey,     add constraint financial_entries_created_by_fkey     foreign key (created_by)          references public.profiles(user_id) on delete set null;
alter table public.loyalty_transactions  drop constraint loyalty_transactions_performed_by_fkey, add constraint loyalty_transactions_performed_by_fkey foreign key (performed_by)       references public.profiles(user_id) on delete set null;
alter table public.professional_blocks   drop constraint professional_blocks_created_by_fkey,  add constraint professional_blocks_created_by_fkey   foreign key (created_by)          references public.profiles(user_id) on delete set null;
alter table public.purchase_orders       drop constraint purchase_orders_created_by_fkey,       add constraint purchase_orders_created_by_fkey       foreign key (created_by)          references public.profiles(user_id);
alter table public.purchase_receipts     drop constraint purchase_receipts_received_by_fkey,    add constraint purchase_receipts_received_by_fkey    foreign key (received_by)         references public.profiles(user_id);
alter table public.sales                 drop constraint sales_cancelled_by_fkey,               add constraint sales_cancelled_by_fkey               foreign key (cancelled_by)        references public.profiles(user_id);
alter table public.sales                 drop constraint sales_user_id_fkey,                    add constraint sales_user_id_fkey                    foreign key (user_id)             references public.profiles(user_id);
alter table public.stock_movements       drop constraint stock_movements_created_by_fkey,       add constraint stock_movements_created_by_fkey       foreign key (created_by)          references public.profiles(user_id);
alter table public.subscriptions         drop constraint subscriptions_trial_claimed_by_fkey,   add constraint subscriptions_trial_claimed_by_fkey   foreign key (trial_claimed_by)    references public.profiles(user_id);
alter table public.user_preferences      drop constraint user_preferences_user_id_fkey,         add constraint user_preferences_user_id_fkey         foreign key (user_id)             references public.profiles(user_id) on delete cascade;

-- ---------------------------------------------------------------- E
-- RLS: auth.uid() -> public.current_profile_user_id() em todas as policies que
-- o usam, reescrevendo USING / WITH CHECK a partir do texto da própria policy
-- (só o token muda: AND/OR/EXISTS/subqueries/roles ficam intactos).
do $$
declare
  r record;
  stmt text;
  n_changed int := 0;
  n_left int;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')
  loop
    stmt := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.qual is not null then
      stmt := stmt || ' using (' || replace(r.qual, 'auth.uid()', 'public.current_profile_user_id()') || ')';
    end if;
    if r.with_check is not null then
      stmt := stmt || ' with check (' || replace(r.with_check, 'auth.uid()', 'public.current_profile_user_id()') || ')';
    end if;
    execute stmt;
    n_changed := n_changed + 1;
  end loop;

  select count(*) into n_left from pg_policies
  where schemaname = 'public' and (qual like '%auth.uid()%' or with_check like '%auth.uid()%');

  if n_left <> 0 then
    raise exception 'Migration E incompleta: % policies ainda usam auth.uid()', n_left;
  end if;

  raise notice 'Migration E: % policies reescritas', n_changed;
end $$;
