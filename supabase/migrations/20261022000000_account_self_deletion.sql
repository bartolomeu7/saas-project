-- =============================================================================
-- Exclusão da própria conta pelo titular (LGPD, art. 18, VI e art. 16).
--
-- RASCUNHO: ainda NÃO aplicada em Production. Validada só no TEST (bateria tests/sql/account_deletion.sql).
--
-- Duas funções, ambas SÓ para service_role (chamadas pela Server Action, que autentica o usuário pelo Clerk e
-- passa o próprio id da sessão; nenhum usuário chama direto):
--   * account_deletion_preview(p_user_id): o que será apagado e se há impedimento (não escreve nada).
--   * delete_account_data(p_user_id): apaga/anonimiza, numa transação.
--
-- Regras:
--   1. Admin/super_admin da plataforma não se exclui por aqui (rebaixar antes).
--   2. Quem é o ÚNICO owner de uma empresa que ainda tem outras pessoas NÃO pode excluir a conta: precisa
--      transferir a propriedade ou remover a equipe antes (impede apagar o trabalho dos outros por engano).
--   3. Empresa em que o usuário é a única pessoa: a empresa e TODOS os seus dados são apagados (cascata).
--   4. Empresa com outras pessoas: o usuário apenas sai (vínculo removido); os dados da empresa ficam com ela.
--   5. O perfil NÃO é apagado: vira um registro anônimo (sem nome, e-mail, foto nem vínculo com o Clerk), porque o
--      aceite dos Termos (user_consents, append-only) e, em empresas que continuam, os registros que a pessoa criou
--      (vendas, caixa, etc.) apontam para ele. Fica só o identificador interno, que não identifica ninguém.
--   6. Registros de pagamento de empresas apagadas são copiados para retained_billing_records SEM dados do
--      pagador (nome/documento), por 5 anos, para obrigação fiscal/contratual (LGPD art. 16, I).
--   7. Preferências, presença e vagas de sessão são apagadas. Os identificadores antifraude do teste grátis
--      (hash irreversível, apagados sozinhos em 30 dias) ficam até o prazo normal.
--
-- NÃO apaga: arquivos do Storage (a Server Action os remove antes, pela API de Storage) nem o usuário no Clerk
-- (a Server Action o remove depois).
-- Rollback: supabase/rollback/20261022000000_account_self_deletion.down.sql
-- =============================================================================
begin;

alter table public.profiles add column if not exists anonymized_at timestamptz;
comment on column public.profiles.anonymized_at is
  'Quando a conta foi excluída pelo titular e o perfil virou registro anônimo (sem nome/e-mail/vínculo Clerk).';

create table if not exists public.retained_billing_records (
  id uuid primary key default gen_random_uuid(),
  former_user_id uuid not null,
  provider text not null,
  provider_transaction_id text,
  end_to_end_id text,
  status text not null,
  amount numeric not null,
  amount_with_tax numeric,
  currency text not null,
  paid_at timestamptz,
  payment_created_at timestamptz not null,
  deleted_at timestamptz not null default now(),
  retain_until date not null default ((now() + interval '5 years')::date)
);
comment on table public.retained_billing_records is
  'Pagamentos de contas excluídas, sem nome/documento do pagador, guardados 5 anos por obrigação fiscal/contratual (LGPD art. 16, I). Expurgo depois de retain_until.';
create index if not exists retained_billing_records_retain_until_idx on public.retained_billing_records (retain_until);
alter table public.retained_billing_records enable row level security;
revoke all on public.retained_billing_records from anon, authenticated;
grant all on public.retained_billing_records to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Prévia (somente leitura)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.account_deletion_preview(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_companies jsonb;
  v_blocked text := null;
begin
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found or v_profile.anonymized_at is not null then
    return jsonb_build_object('found', false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'company_id', x.company_id,
           'name', x.name,
           'role', x.role,
           'other_members', x.other_members,
           'other_owners', x.other_owners,
           'will_delete', x.other_members = 0,
           'blocks', (x.role = 'owner' and x.other_owners = 0 and x.other_members > 0),
           'has_paid_plan', x.has_paid_plan,
           'expires_at', x.expires_at
         ) order by x.name), '[]'::jsonb)
    into v_companies
    from (
      select cm.company_id, c.name, cm.role::text as role,
             (select count(*) from public.company_members o where o.company_id = cm.company_id and o.user_id <> p_user_id) as other_members,
             (select count(*) from public.company_members o where o.company_id = cm.company_id and o.user_id <> p_user_id and o.role = 'owner') as other_owners,
             exists (select 1 from public.subscriptions s where s.company_id = cm.company_id and s.status = 'active' and not s.lifetime
                      and (s.expires_at is null or s.expires_at > now())) as has_paid_plan,
             (select max(s.expires_at) from public.subscriptions s where s.company_id = cm.company_id and s.status = 'active') as expires_at
        from public.company_members cm
        join public.companies c on c.id = cm.company_id
       where cm.user_id = p_user_id
    ) x;

  if v_profile.role <> 'user' then
    v_blocked := 'PLATFORM_ADMIN';
  elsif exists (select 1 from jsonb_array_elements(v_companies) e where (e ->> 'blocks')::boolean) then
    v_blocked := 'OWNS_TEAM_COMPANY';
  end if;

  return jsonb_build_object(
    'found', true,
    'blocked_reason', v_blocked,
    'email', v_profile.email,
    'full_name', v_profile.full_name,
    'clerk_user_id', v_profile.clerk_user_id,
    'companies', v_companies
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Exclusão
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.delete_account_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_preview jsonb;
  v_company jsonb;
  v_company_id uuid;
  v_deleted int := 0;
  v_left int := 0;
  v_clerk_user_id text;
begin
  -- serializa com qualquer outra operação sobre este perfil
  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if not found or v_profile.anonymized_at is not null then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_clerk_user_id := v_profile.clerk_user_id;

  v_preview := public.account_deletion_preview(p_user_id);
  if v_preview ->> 'blocked_reason' is not null then
    raise exception 'ACCOUNT_DELETE_BLOCKED:%', v_preview ->> 'blocked_reason' using errcode = 'P0001';
  end if;

  for v_company in select * from jsonb_array_elements(v_preview -> 'companies') loop
    v_company_id := (v_company ->> 'company_id')::uuid;
    if (v_company ->> 'will_delete')::boolean then
      -- guarda o mínimo de cobrança (sem dados do pagador) e apaga a empresa inteira (cascata)
      insert into public.retained_billing_records
        (former_user_id, provider, provider_transaction_id, end_to_end_id, status, amount, amount_with_tax, currency, paid_at, payment_created_at)
      select p_user_id, sp.provider, sp.provider_transaction_id, sp.end_to_end_id, sp.status::text, sp.amount, sp.amount_with_tax,
             sp.currency, sp.paid_at, sp.created_at
        from public.subscription_payments sp
       where sp.company_id = v_company_id and sp.paid_at is not null;
      delete from public.companies where id = v_company_id;
      v_deleted := v_deleted + 1;
    else
      delete from public.company_members where company_id = v_company_id and user_id = p_user_id;
      v_left := v_left + 1;
    end if;
  end loop;

  delete from public.user_preferences where user_id = p_user_id;
  delete from public.user_presence where user_id = p_user_id;
  delete from public.user_session_slots where user_id = p_user_id;

  -- perfil vira registro anônimo (não é apagado: aceite append-only e registros em empresas que continuam apontam para ele)
  update public.profiles
     set full_name = null,
         email = null,
         avatar_url = null,
         clerk_user_id = null,
         status = 'inactive',
         anonymized_at = now()
   where user_id = p_user_id;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (null, null, 'account', p_user_id, 'account.self_deleted',
          jsonb_build_object('companies_deleted', v_deleted, 'companies_left', v_left, '_origin', 'system'));

  return jsonb_build_object('companies_deleted', v_deleted, 'companies_left', v_left, 'clerk_user_id', v_clerk_user_id);
end;
$$;

revoke all on function public.account_deletion_preview(uuid) from public, anon, authenticated;
revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_preview(uuid) to service_role;
grant execute on function public.delete_account_data(uuid) to service_role;

commit;
