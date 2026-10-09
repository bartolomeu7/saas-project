-- =============================================================================
-- Presença: piso de 90 s para "online agora" (somente TEST nesta fase)
--
-- Achado do QA 06.1: o heartbeat do app envia um sinal a cada 60 s, mas a janela de
-- "online agora" podia ser configurada em até 30 s, fazendo usuários ativos oscilarem
-- para "ativo recentemente". O piso passa a ser 90 s (60 s de heartbeat + margem).
-- Valores já gravados abaixo do piso são elevados ao piso.
-- =============================================================================
create or replace function public.platform_setting_definitions()
 returns table (key text, default_value integer, min_value integer, max_value integer, description text)
 language sql
 immutable
 set search_path to 'public'
as $function$
  select * from (values
    ('admin_max_free_days', 30, 1, 365,
     'Máximo de dias gratuitos que um ADMIN pode conceder em uma única operação (super_admin pode até 365).'),
    ('presence_online_seconds', 120, 90, 900,
     'Segundos desde o último sinal para um usuário contar como ONLINE (mínimo 90: o heartbeat do app roda a cada 60 s).'),
    ('presence_recent_minutes', 15, 5, 240,
     'Minutos desde o último sinal para um usuário contar como RECENTEMENTE ONLINE.')
  ) as t(key, default_value, min_value, max_value, description);
$function$;
revoke all on function public.platform_setting_definitions() from public, anon, authenticated;

update public.platform_settings
   set value = to_jsonb(90), updated_at = now()
 where key = 'presence_online_seconds' and (value #>> '{}')::integer < 90;
