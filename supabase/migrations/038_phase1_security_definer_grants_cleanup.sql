-- Phase 1 follow-up: remove inherited PUBLIC execute from trigger-only SECURITY DEFINER functions.
revoke all on function public.create_cash_movement_from_sale_payment() from public;
revoke all on function public.handle_sale_status_change_for_loyalty() from public;