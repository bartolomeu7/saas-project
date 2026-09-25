-- Fase 6: remove função SECURITY DEFINER desnecessária para bootstrap de settings.
drop function if exists public.ensure_company_settings();
