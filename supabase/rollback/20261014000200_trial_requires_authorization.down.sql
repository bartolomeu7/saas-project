-- =============================================================================
-- ROLLBACK de 20261014000200_trial_requires_authorization.sql (CONTRAÇÃO)
-- Restaura create_company_with_owner() ao corpo ORIGINAL (anterior à missão): o teste grátis volta a ser concedido a todo
-- cadastro novo, sem exigir autorização do servidor. Nenhum dado é alterado.
-- =============================================================================
begin;

create or replace function public.create_company_with_owner(p_name text, p_business_type business_type default 'other'::business_type)
returns companies
language plpgsql security definer set search_path to 'public' as $$
declare
  v_user_id uuid := public.current_profile_user_id();
  v_company public.companies;
  v_trial_plan public.plans;
  v_trial_already_used boolean;
  v_expires_at timestamptz;
  v_already_has_company boolean;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  -- Serializa chamadas concorrentes desta função para o MESMO usuário.
  -- hashtext() reduz o uuid a um int para o parâmetro bigint do advisory
  -- lock; colisões de hash entre usuários diferentes só fariam duas
  -- transações de usuários DIFERENTES esperarem uma pela outra por um
  -- instante (nunca causariam um resultado incorreto), então são
  -- aceitáveis e não comprometem a correção.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- Guard da migration 016 — agora executado com exclusividade garantida
  -- pelo lock acima, o que fecha a janela de corrida (TOCTOU) que existia
  -- antes: a segunda chamada só chega aqui depois que a primeira já
  -- commitou (ou desistiu), então sempre enxerga o estado real e final.
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

commit;
