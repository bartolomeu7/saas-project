-- Phase 2: Loyalty RBAC hardening.
-- Applied to Supabase as migration 20260923115529_phase2_loyalty_rbac_hardening.

alter policy loyalty_multipliers_insert_own_company on public.loyalty_multipliers
with check (company_id in (select cm.company_id from public.company_members cm where cm.user_id = (select auth.uid()) and cm.role in ('owner','admin')));

alter policy loyalty_multipliers_update_own_company on public.loyalty_multipliers
using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = (select auth.uid()) and cm.role in ('owner','admin')))
with check (company_id in (select cm.company_id from public.company_members cm where cm.user_id = (select auth.uid()) and cm.role in ('owner','admin')));

alter policy loyalty_multipliers_delete_own_company on public.loyalty_multipliers
using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = (select auth.uid()) and cm.role in ('owner','admin')));

alter policy loyalty_settings_insert_own_company on public.loyalty_settings
with check (company_id in (select cm.company_id from public.company_members cm where cm.user_id = (select auth.uid()) and cm.role in ('owner','admin')));

alter policy loyalty_settings_update_own_company on public.loyalty_settings
using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = (select auth.uid()) and cm.role in ('owner','admin')))
with check (company_id in (select cm.company_id from public.company_members cm where cm.user_id = (select auth.uid()) and cm.role in ('owner','admin')));

alter policy loyalty_tier_thresholds_insert_own_company on public.loyalty_tier_thresholds
with check (company_id in (select cm.company_id from public.company_members cm where cm.user_id = (select auth.uid()) and cm.role in ('owner','admin')));

alter policy loyalty_tier_thresholds_update_own_company on public.loyalty_tier_thresholds
using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = (select auth.uid()) and cm.role in ('owner','admin')))
with check (company_id in (select cm.company_id from public.company_members cm where cm.user_id = (select auth.uid()) and cm.role in ('owner','admin')));

alter policy loyalty_tier_thresholds_delete_own_company on public.loyalty_tier_thresholds
using (company_id in (select cm.company_id from public.company_members cm where cm.user_id = (select auth.uid()) and cm.role in ('owner','admin')));