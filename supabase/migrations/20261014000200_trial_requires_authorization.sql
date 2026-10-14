-- =============================================================================
-- Missão 09 — CONTRAÇÃO: o teste grátis passa a exigir autorização do servidor. Aplicada SOMENTE em TEST.
--
-- ORDEM OBRIGATÓRIA: só aplicar DEPOIS de 20261014000000 e 20261014000100 e DEPOIS do deploy do código que chama
-- authorize_trial_signup() no onboarding (createCompanyAction). Antes disso, o código antigo criaria empresas SEM teste.
-- Enquanto esta migration não é aplicada o comportamento é o anterior (teste concedido a todo cadastro novo, sem
-- antifraude): é a janela de transição, documentada em docs/plans-and-usage-limits.md.
--
-- create_company_with_owner(): idêntica à original, exceto que a concessão do teste passa por
-- grant_free_trial_internal(), que exige autorização válida (não consumida, dentro do prazo) e é idempotente.
-- Chamada direta do cliente (sem autorização) cria a empresa SEM teste.
--
-- Rollback: supabase/rollback/20261014000200_trial_requires_authorization.down.sql
-- =============================================================================
begin;

create or replace function public.create_company_with_owner(p_name text, p_business_type business_type default 'other'::business_type)
returns companies
language plpgsql security definer set search_path to 'public' as $$
declare
  v_user_id uuid := public.current_profile_user_id();
  v_company public.companies;
  v_already_has_company boolean;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  -- Serializa chamadas concorrentes desta função para o MESMO usuário (ver migration 017).
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

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

  -- Concede o teste SOMENTE com autorização do servidor; false = empresa criada sem teste.
  perform public.grant_free_trial_internal(v_user_id, v_company.id);

  return v_company;
end;
$$;

commit;
