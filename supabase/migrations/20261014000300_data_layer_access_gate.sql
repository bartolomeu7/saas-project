-- =============================================================================
-- Missão 09 — Acesso aos dados de negócio exige acesso ATIVO no banco (defesa em profundidade). Somente TEST.
--
-- ACHADO (provado em TEST antes desta migration): as políticas de escrita das tabelas de negócio só conferiam a
-- ASSOCIAÇÃO à empresa. Quem tinha empresa mas nenhuma assinatura (teste negado, assinatura vencida) não via o app
-- (o middleware redireciona para /app/assinatura), mas ainda conseguia gravar clientes, produtos, vendas etc. chamando
-- a API do Supabase diretamente com o próprio token. Negar o teste grátis só na camada HTTP não nega o acesso.
--
-- Esta migration adiciona políticas RESTRICTIVE (AND com as existentes) para INSERT/UPDATE/DELETE nas tabelas de
-- negócio: a empresa precisa ter acesso ativo (subscription_access_active: status trialing/active E vitalício OU
-- expires_at no futuro — a MESMA regra do middleware). Leitura (SELECT) NÃO é alterada: vencidos continuam vendo e
-- exportando os próprios dados. service_role (webhooks, RPCs de plataforma) não passa por RLS. As funções
-- SECURITY DEFINER existentes continuam funcionando como antes.
--
-- Independente do restante da missão: pode ser aplicada ou não (decisão de produto), sem afetar planos/sessões/teste.
-- Rollback: supabase/rollback/20261014000300_data_layer_access_gate.down.sql
-- =============================================================================
begin;

create or replace function public.company_has_active_access(p_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
     where s.company_id = p_company_id and public.subscription_access_active(s.status, s.expires_at, s.lifetime));
$$;
revoke all on function public.company_has_active_access(uuid) from public, anon;
grant execute on function public.company_has_active_access(uuid) to authenticated, service_role;

do $$
declare
  t record;
  c text;
begin
  -- (tabela, comandos que já possuem política de escrita em TEST/Production)
  for t in select * from (values
    ('company_settings',        array['INSERT','UPDATE','DELETE']),
    ('cost_centers',            array['INSERT','UPDATE']),
    ('customer_documents',      array['INSERT','DELETE']),
    ('customer_raffle_entries', array['INSERT']),
    ('customer_raffles',        array['INSERT']),
    ('customers',               array['INSERT','UPDATE','DELETE']),
    ('financial_categories',    array['INSERT','UPDATE']),
    ('loyalty_campaigns',       array['INSERT','UPDATE','DELETE']),
    ('loyalty_multipliers',     array['INSERT','UPDATE','DELETE']),
    ('loyalty_settings',        array['INSERT','UPDATE']),
    ('loyalty_tier_thresholds', array['INSERT','UPDATE','DELETE']),
    ('product_categories',      array['INSERT','UPDATE']),
    ('products',                array['INSERT','UPDATE']),
    ('sale_items',              array['INSERT','UPDATE','DELETE']),
    ('sales',                   array['INSERT','UPDATE']),
    ('service_categories',      array['INSERT','UPDATE']),
    ('services',                array['INSERT','UPDATE']),
    ('suppliers',               array['INSERT','UPDATE'])
  ) as v(tbl, cmds)
  loop
    foreach c in array t.cmds loop
      if c = 'INSERT' then
        execute format('drop policy if exists %I on public.%I', t.tbl || '_require_access_ins', t.tbl);
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.company_has_active_access(company_id))',
                       t.tbl || '_require_access_ins', t.tbl);
      elsif c = 'UPDATE' then
        execute format('drop policy if exists %I on public.%I', t.tbl || '_require_access_upd', t.tbl);
        execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.company_has_active_access(company_id)) with check (public.company_has_active_access(company_id))',
                       t.tbl || '_require_access_upd', t.tbl);
      else
        execute format('drop policy if exists %I on public.%I', t.tbl || '_require_access_del', t.tbl);
        execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.company_has_active_access(company_id))',
                       t.tbl || '_require_access_del', t.tbl);
      end if;
    end loop;
  end loop;
end $$;

commit;
