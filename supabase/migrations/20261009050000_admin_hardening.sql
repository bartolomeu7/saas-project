-- =============================================================================
-- Hardening final do Admin Control Center (somente TEST nesta fase)
--
-- Achado da auditoria de segurança (get_advisors): a função de trigger
-- protect_last_super_admin() estava executável por anon/authenticated via RPC.
-- Funções de trigger não podem ser chamadas diretamente (o Postgres recusa), então
-- não era explorável, mas não há motivo para expô-la: o trigger continua funcionando
-- normalmente (triggers não dependem de EXECUTE do chamador).
-- =============================================================================
revoke all on function public.protect_last_super_admin() from public, anon, authenticated;
