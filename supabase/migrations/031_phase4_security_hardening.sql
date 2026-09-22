revoke all on function public.list_company_team() from public, anon;
grant execute on function public.list_company_team() to authenticated;

drop policy if exists professional_profiles_select_company on public.professional_profiles;
create policy professional_profiles_select_company
on public.professional_profiles for select
using (company_id in (
  select cm.company_id from public.company_members cm where cm.user_id = (select auth.uid())
));

drop policy if exists professional_services_select_company on public.professional_services;
create policy professional_services_select_company
on public.professional_services for select
using (professional_id in (
  select pp.id
  from public.professional_profiles pp
  join public.company_members cm on cm.company_id = pp.company_id
  where cm.user_id = (select auth.uid())
));

drop policy if exists professional_availability_select_company on public.professional_availability;
create policy professional_availability_select_company
on public.professional_availability for select
using (professional_id in (
  select pp.id
  from public.professional_profiles pp
  join public.company_members cm on cm.company_id = pp.company_id
  where cm.user_id = (select auth.uid())
));

drop policy if exists professional_blocks_select_company on public.professional_blocks;
create policy professional_blocks_select_company
on public.professional_blocks for select
using (company_id in (
  select cm.company_id from public.company_members cm where cm.user_id = (select auth.uid())
));

drop policy if exists appointments_select_company on public.appointments;
create policy appointments_select_company
on public.appointments for select
using (company_id in (
  select cm.company_id from public.company_members cm where cm.user_id = (select auth.uid())
));