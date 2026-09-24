-- Fase 6: restringe funções administrativas novas ao role authenticated.
revoke execute on function public.is_platform_admin() from anon, public;
grant execute on function public.is_platform_admin() to authenticated;

revoke execute on function public.get_platform_admin_overview() from anon, public;
grant execute on function public.get_platform_admin_overview() to authenticated;

revoke execute on function public.list_platform_admin_companies() from anon, public;
grant execute on function public.list_platform_admin_companies() to authenticated;

revoke execute on function public.set_platform_company_status(uuid, public.company_status) from anon, public;
grant execute on function public.set_platform_company_status(uuid, public.company_status) to authenticated;

revoke execute on function public.ensure_company_settings() from anon, public;
grant execute on function public.ensure_company_settings() to authenticated;
