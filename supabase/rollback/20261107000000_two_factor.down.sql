-- Rollback de 20261107000000_two_factor.
-- ATENÇÃO: apaga o segredo, os códigos de backup e as verificações de sessão de TODOS os usuários. Quem tinha a segunda
-- etapa ativa volta a entrar só com o login do Clerk (sem lockout). Faça isto só depois de tirar o código do middleware
-- do ar (o gate trata "função ausente" como não instalado e libera, então a ordem segura é: deploy sem o gate -> rollback).
begin;
drop function if exists public.admin_reset_two_factor(uuid);
drop function if exists public.two_factor_reserve_attempt(uuid);
drop function if exists public.two_factor_gate_status(text);
drop table if exists public.two_factor_session_verifications;
drop table if exists public.user_two_factor_backup_codes;
drop table if exists public.user_two_factor;
commit;
