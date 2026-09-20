-- Correção da corrida (TOCTOU) em create_company_with_owner().
--
-- Auditoria confirmou (código lido, sem exagero): a migration 016 adicionou
-- um guard "SELECT EXISTS(... WHERE user_id = v_user_id)" antes do INSERT,
-- mas essa checagem não é atômica com o INSERT que vem depois. Sob READ
-- COMMITTED (o nível de isolamento padrão do Postgres, usado aqui), duas
-- transações que cheguem nesse SELECT antes de qualquer uma das duas
-- commitar o INSERT em company_members enxergam ambas "false" e, portanto,
-- ambas passam pelo guard e criam uma empresa cada uma para o MESMO
-- usuário — exatamente o cenário que a migration 016 alega ter corrigido
-- (duas abas de onboarding, duplo clique, retry de rede).
--
-- Por que não uma UNIQUE constraint em company_members.user_id?
-- Porque isso fecharia a porta, no nível de banco, para qualquer futuro
-- fluxo de convite/equipe compartilhada (uma mesma pessoa pertencendo a
-- mais de uma empresa) — algo que o modelo de dados já foi desenhado para
-- suportar (docs/architecture.md: "company_members já suportaria múltiplas
-- memberships por usuário se um fluxo de convite/equipe compartilhada for
-- implementado no futuro"). Não há, hoje, nenhuma decisão de produto que
-- justifique essa restrição permanente e irreversível no schema.
--
-- Correção: um advisory lock transacional (pg_advisory_xact_lock),
-- derivado do próprio user_id, adquirido ANTES do guard. Ele serializa
-- chamadas concorrentes desta função para o MESMO usuário (a segunda
-- chamada bloqueia até a primeira commitar ou fazer rollback), sem exigir
-- nenhuma constraint permanente no schema e sem afetar chamadas de
-- usuários diferentes (que usam locks diferentes, calculados a partir de
-- hashtext(user_id), e não se bloqueiam entre si). É liberado
-- automaticamente no fim da transação (commit ou rollback) — não exige
-- nenhum "unlock" manual.
--
-- Corpo idêntico ao da migration 016, só com a linha do advisory lock
-- adicionada logo após a validação de autenticação, antes do guard
-- existente. Nenhuma tabela, coluna, constraint ou policy de RLS é
-- alterada — só o corpo da função.
--
-- *** MIGRATION CRIADA, MAS NÃO APLICADA EM PRODUÇÃO NESTA SESSÃO ***
-- Conforme instrução explícita do ticket de manutenção autônoma, migrations
-- não são aplicadas sem autorização direta do usuário. Aguardando OK para
-- rodar via `apply_migration` (ou `supabase db push`) no projeto
-- fpbcruinppjbwtinzrdg.

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

comment on function public.create_company_with_owner(text, business_type) is
  'Cria uma empresa e vincula o usuário autenticado como owner, atomicamente — e concede o teste grátis de 1 dia se este usuário (não só esta empresa) ainda não reivindicou um antes. Único caminho de escrita para companies/company_members/trial inicial. Rejeita a chamada se o usuário já pertencer a qualquer empresa. Protegido contra corrida real via pg_advisory_xact_lock por usuário (migration 017) — a checagem "já tem empresa" (migration 016) sozinha não bastava sob chamadas verdadeiramente concorrentes.';

-- Também corrige getCurrentCompany(): mesmo com o lock acima eliminando
-- NOVAS duplicidades, uma consulta sem ORDER BY continua sendo frágil por
-- princípio (não determinística caso qualquer duplicidade histórica ou
-- futura exista por outro caminho). Sem alteração de schema aqui — a
-- correção correspondente é no código da aplicação
-- (src/lib/companies/queries.ts), adicionando "order by created_at asc"
-- na consulta de company_members.
