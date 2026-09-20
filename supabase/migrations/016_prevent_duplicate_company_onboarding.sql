-- Manutenção autônoma: create_company_with_owner() é documentada como
-- "único caminho de escrita para companies/company_members/trial inicial"
-- (comentário já existente na função, migration 009), mas nunca impedia
-- o mesmo usuário de chamá-la mais de uma vez. getCurrentCompany() supõe
-- uma única empresa por usuário (busca com .limit(1), sem seletor de
-- empresa em lugar nenhum da aplicação) — hoje não existe nenhum fluxo
-- de convite/adição a uma segunda empresa (Equipe/Colaboradores ainda
-- não foi implementado), então nada legítimo depende de um usuário ter
-- mais de uma linha em company_members.
--
-- Sem esse guard, dois envios concorrentes do formulário de onboarding
-- (ex.: duas abas abertas, ou o usuário voltando para /onboarding antes
-- do primeiro envio terminar) podiam criar DUAS empresas para o mesmo
-- usuário — e qual delas getCurrentCompany() passaria a devolver ficaria
-- não-determinístico (LIMIT 1 sem ORDER BY).
--
-- Corpo idêntico ao já existente, só com a checagem nova logo após a
-- validação de autenticação. Nenhuma tabela, coluna, constraint ou
-- policy de RLS é alterada — só o corpo da função.

create or replace function public.create_company_with_owner(
  p_name text,
  p_business_type business_type default 'other'::business_type
)
returns companies
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_company public.companies;
  v_trial_plan public.plans;
  v_trial_already_used boolean;
  v_expires_at timestamptz;
  v_already_has_company boolean;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  -- Correção: sem este guard, chamadas concorrentes (duas abas, duplo
  -- envio) podiam criar mais de uma empresa para o mesmo usuário.
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

  if not v_trial_already_used then
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

  return v_company;
end;
$$;

comment on function public.create_company_with_owner(text, business_type) is
  'Cria uma empresa e vincula o usuário autenticado como owner, atomicamente — e concede o teste grátis de 1 dia se este usuário (não só esta empresa) ainda não reivindicou um antes. Único caminho de escrita para companies/company_members/trial inicial. Rejeita a chamada se o usuário já pertencer a qualquer empresa (corrigido na manutenção autônoma — antes permitia múltiplas empresas por usuário via chamadas concorrentes).';
