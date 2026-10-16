-- =============================================================================
-- Minimização de privilégios (Missão 07) — aplicada SOMENTE em TEST nesta missão. Production exige autorização própria.
--
-- Achado da auditoria: as tabelas legadas do schema public herdaram o padrão do Supabase (todos os privilégios para
-- anon e authenticated). A RLS protege os dados, mas privilégio é defesa em profundidade e TRUNCATE ignora a RLS.
--
--  1. anon: NENHUM privilégio de tabela. Não existe policy para anon em nenhuma tabela, e os dados públicos
--     (planos, versões vigentes dos documentos) saem de RPCs SECURITY DEFINER (get_public_plans,
--     get_current_legal_documents), que não dependem de privilégio de tabela do chamador.
--  2. authenticated: perde TRUNCATE, TRIGGER, REFERENCES e MAINTAIN (o app nunca usa; TRUNCATE ignora RLS).
--     Mantém SELECT/INSERT/UPDATE/DELETE onde já tinha: o app grava via cliente de sessão, protegido por RLS.
--  3. Funções de trigger não precisam ser executáveis por ninguém (o EXECUTE só é checado ao criar o trigger).
--  4. Privilégios padrão futuros (role postgres): sem acesso para anon e sem EXECUTE para PUBLIC/anon em funções novas;
--     as migrations já fazem `grant execute ... to authenticated` explícito nas RPCs que precisam.
--
-- ROLLBACK (exato, do estado anterior):
--   grant all on all tables in schema public to anon;
--   grant truncate, references, trigger, maintain on all tables in schema public to authenticated;  -- (sales/products/audit_logs
--     tinham subconjuntos menores: refaça a partir do relatório docs/qa/mission-07-financial-security-ci-auth-legal.md, seção C)
--   alter default privileges for role postgres in schema public grant all on tables to anon;
--   alter default privileges for role postgres in schema public grant execute on functions to public, anon;
--   (funções de trigger: grant execute on function <nome>() to public, anon, authenticated;)
-- =============================================================================

-- 1) anon sem privilégios de tabela/sequência
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 2) authenticated sem privilégios que o app não usa
revoke truncate, references, trigger, maintain on all tables in schema public from authenticated;

-- 3) funções de trigger não são RPC
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- 4) padrões futuros
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger, maintain on tables from authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
