-- =============================================================================
-- *** CANDIDATA NÃO APLICADA — REQUER REVISÃO E AUTORIZAÇÃO — FORA DA SEQUÊNCIA EXECUTÁVEL (supabase/candidates/) ***
-- Identificador reservado: 20261014000400_commercial_write_gate (livre em todas as refs do repositório em 2026-10-18;
-- ao ser autorizada, promover com `git mv` para supabase/migrations/ e o .down.sql para supabase/rollback/).
-- Prime Ges — Gate Integral de acesso comercial. Substitui, como desenho, a `20261014000300_data_layer_access_gate`
-- (incompleta; NÃO deve ser aplicada). Não aplicar em Production nem em qualquer banco sem autorização específica.
-- Reversão: `20261014000400_commercial_write_gate.down.sql` (mesma pasta). Evidências e lacunas: supabase/candidates/README.md.
-- Os comandos SQL abaixo (a partir de `begin;`) são idênticos ao texto validado fora da Fase 3; só comentários de cabeçalho mudaram.
--
-- O QUE FAZ
--   Um PONTO ÚNICO de controle no banco: um gatilho BEFORE INSERT/UPDATE/DELETE por linha (`a0_commercial_write_gate`) em
--   36 tabelas de dados de negócio. Recusa a gravação de um USUÁRIO FINAL (JWT role = authenticated) quando a empresa dona
--   da linha não tem acesso comercial vigente (`subscription_access_active`: status trialing/active E (vitalício OU
--   expires_at no futuro)). Vale para gravação direta (Supabase), RPCs SECURITY DEFINER atuais e futuras e cascatas.
--
-- DECISÕES JÁ TOMADAS (respeitadas)
--   D1 bloquear só GRAVAÇÃO; leitura e exportação não são tocadas (nenhuma política de SELECT é criada/alterada).
--   D2 carência = 0 h: NÃO há configuração de carência (qualquer carência futura exige nova migration alinhada ao TypeScript).
--   D3 empresa `inactive` NÃO é verificada nesta etapa (nenhuma configuração/flag foi criada).
--   => esta revisão NÃO altera `platform_setting_definitions()` e NÃO cria chaves em `platform_settings` (a asserção
--      "7 configurações" de `usage_limits` continua válida).
--
-- NÃO BLOQUEIA (por desenho)
--   service_role (webhook EvoPay, rotas do servidor); conexões internas sem JWT (migrations, manutenção, cron); cascatas de
--   gatilho de sistema (pg_trigger_depth() > 1, ex.: semente financeira na criação da empresa); tabelas comerciais e
--   administrativas (subscriptions, subscription_payments, company_entitlements, company_members, audit_logs,
--   platform_operation_keys, finance_default_seed_guard) — renovar/regularizar precisa continuar possível.
--
-- LIMITES CONHECIDOS (ver supabase/candidates/README.md): gatilho por linha (UPDATE/DELETE que afeta 0 linhas não dispara); TRUNCATE não coberto
--   (authenticated não tem o privilégio); Storage (`storage.objects`) não coberto — hoje fechado pelas políticas de
--   storage, que usam auth.uid() (falha com sub do Clerk); `session_user = 'authenticator'` no PostgREST real: INFERRED.
--
-- DEPENDÊNCIAS: public.subscription_access_active(subscription_status, timestamptz, boolean) [definida em
--   20261012000000_lifetime_access_and_license_ops.sql] e public.current_profile_user_id() [20261006000000 / 20261008010000],
--   tabelas public.subscriptions, public.company_members e public.professional_profiles. A existência desses objetos em
--   Production NÃO foi verificada na Fase 3 (sem acesso a banco). NÃO depende da `…000200`.
--
-- REVISÃO (missão anterior, após verificação em TEST com rollback): o gatilho só recusa quem é MEMBRO da empresa; não-membros seguem para a
--   RLS (que recusa). Sem isso, um usuário autenticado distinguiria "empresa com/sem acesso comercial" de qualquer UUID.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. Quem é o escritor? Usuário final x sistema. Falha FECHADO: JWT ilegível ou papel desconhecido = usuário.
--    Sistema = JWT service_role, ou conexão interna SEM JWT que não seja o PostgREST (session_user <> 'authenticator').
-- -----------------------------------------------------------------------------
create or replace function public.commercial_gate_is_user_context()
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb;
  v_role text;
begin
  begin
    v_claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return true;
  end;
  v_role := v_claims ->> 'role';
  if v_role = 'service_role' then return false; end if;
  if v_role is null and session_user <> 'authenticator' then return false; end if;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Regra comercial ÚNICA no banco: reusa subscription_access_active (a mesma do middleware/TypeScript). Sem assinatura = sem
--    acesso. VOLATILE de propósito: lê o estado atual a cada chamada (renovação/expiração no meio de uma transação).
--    NÃO é executável por authenticated (a 000300 expunha um "oráculo" de assinatura de outra empresa).
-- -----------------------------------------------------------------------------
create or replace function public.company_write_allowed(p_company_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
begin
  if p_company_id is null then return false; end if;
  select * into v_sub from public.subscriptions s where s.company_id = p_company_id;
  if not found then return false; end if;
  return coalesce(public.subscription_access_active(v_sub.status, v_sub.expires_at, v_sub.lifetime), false);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. O gatilho. TG_ARGV[0] = 'professional' resolve a empresa pelo profissional (tabelas filhas sem company_id).
--    Mensagem estável para a interface: começa com `COMMERCIAL_ACCESS_REQUIRED` (SQLSTATE P0001, com HINT).
-- -----------------------------------------------------------------------------
create or replace function public.enforce_company_write_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_row jsonb;
begin
  if pg_catalog.pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if not public.commercial_gate_is_user_context() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_row := pg_catalog.to_jsonb(case when tg_op = 'DELETE' then old else new end);
  if tg_argv[0] = 'professional' then
    select pp.company_id into v_company from public.professional_profiles pp where pp.id = (v_row ->> 'professional_id')::uuid;
  else
    v_company := (v_row ->> 'company_id')::uuid;
  end if;

  -- sem empresa resolvida: deixa as constraints (NOT NULL / FK / RLS) responderem; não abre caminho de escrita
  if v_company is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- SEM ORÁCULO ENTRE EMPRESAS: este gatilho roda ANTES do WITH CHECK da RLS. Só quem é membro da empresa recebe a recusa
  -- comercial; para quem NÃO é membro devolvemos a linha e a RLS recusa com o erro de sempre (mesma resposta para empresa
  -- inexistente, sem assinatura ou com assinatura ativa). Não abre caminho: toda política de escrita das 36 tabelas exige
  -- company_members (verificado no catálogo de Production); o que a RLS nega continua negado.
  if not exists (
    select 1 from public.company_members m
     where m.company_id = v_company and m.user_id = public.current_profile_user_id()
  ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if not public.company_write_allowed(v_company) then
    raise exception 'COMMERCIAL_ACCESS_REQUIRED: a empresa não tem acesso comercial vigente para gravar dados (%).', tg_table_name
      using errcode = 'P0001',
            hint = 'Renove ou regularize a assinatura. Leitura e exportação continuam disponíveis.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.commercial_gate_is_user_context() from public, anon, authenticated;
revoke all on function public.company_write_allowed(uuid) from public, anon, authenticated;
revoke all on function public.enforce_company_write_access() from public, anon, authenticated;
grant execute on function public.company_write_allowed(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 4. Instalação nas 36 tabelas de dados de negócio (34 com company_id + 2 filhas do profissional).
--    O nome a0_ roda o gatilho ANTES dos demais BEFORE (ex.: *_protect_company_id): falha cedo e de forma uniforme.
--    Idempotente (drop trigger if exists).
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts_payable','appointments','cash_movements','cash_registers','company_settings','cost_centers',
    'customer_documents','customer_raffle_entries','customer_raffles','customers','financial_categories',
    'financial_entries','loyalty_accounts','loyalty_campaigns','loyalty_multipliers','loyalty_settings',
    'loyalty_tier_thresholds','loyalty_transactions','product_categories','products','professional_blocks',
    'professional_profiles','purchase_order_items','purchase_orders','purchase_receipt_items','purchase_receipts',
    'sale_items','sale_payments','sales','service_categories','services','stock_movements','supplier_products',
    'suppliers']
  loop
    execute format('drop trigger if exists a0_commercial_write_gate on public.%I', t);
    execute format('create trigger a0_commercial_write_gate before insert or update or delete on public.%I
                    for each row execute function public.enforce_company_write_access()', t);
  end loop;
  foreach t in array array['professional_availability','professional_services']
  loop
    execute format('drop trigger if exists a0_commercial_write_gate on public.%I', t);
    execute format('create trigger a0_commercial_write_gate before insert or update or delete on public.%I
                    for each row execute function public.enforce_company_write_access(%L)', t, 'professional');
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Verificações de instalação (a migration FALHA, e tudo é desfeito, se algo não estiver como projetado):
--    (a) 36 gatilhos; (b) nenhuma das 3 funções executável por anon/authenticated/public;
--    (c) toda tabela de public com coluna company_id está CLASSIFICADA: com gate ou na lista de exclusão por desenho
--        (impede que uma tabela nova de negócio fique fora do gate sem decisão explícita).
-- -----------------------------------------------------------------------------
do $$
declare
  v_triggers integer;
  v_unclassified text;
begin
  select count(*) into v_triggers
    from pg_catalog.pg_trigger g
    join pg_catalog.pg_class c on c.oid = g.tgrelid
   where g.tgname = 'a0_commercial_write_gate' and not g.tgisinternal and c.relnamespace = 'public'::regnamespace;
  if v_triggers <> 36 then
    raise exception 'gate comercial: esperados 36 gatilhos, encontrados %', v_triggers;
  end if;

  if exists (
    select 1
      from (values ('public.commercial_gate_is_user_context()'), ('public.company_write_allowed(uuid)'), ('public.enforce_company_write_access()')) f(sig),
           (values ('anon'), ('authenticated')) r(role_name)
     where pg_catalog.has_function_privilege(r.role_name, f.sig, 'execute')
  ) then
    raise exception 'gate comercial: função auxiliar executável por anon/authenticated';
  end if;
  if exists (
    select 1
      from (values ('public.commercial_gate_is_user_context()'), ('public.company_write_allowed(uuid)'), ('public.enforce_company_write_access()')) f(sig),
           pg_catalog.pg_proc p
     where p.oid = f.sig::regprocedure and p.proacl is not null
       and exists (select 1 from pg_catalog.aclexplode(p.proacl) a where a.grantee = 0)
  ) then
    raise exception 'gate comercial: função auxiliar executável por PUBLIC';
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into v_unclassified
    from pg_catalog.pg_class c
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and c.relname not in ('subscriptions','subscription_payments','company_entitlements','company_members',
                           'audit_logs','platform_operation_keys','finance_default_seed_guard')
     and not exists (select 1 from pg_catalog.pg_trigger g where g.tgrelid = c.oid and g.tgname = 'a0_commercial_write_gate' and not g.tgisinternal);
  if v_unclassified is not null then
    raise exception 'gate comercial: tabela(s) com company_id sem classificação: %', v_unclassified;
  end if;
end $$;

commit;
