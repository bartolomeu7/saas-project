-- Clerk cutover, Migration H: remove o resíduo funcional do Supabase Auth.
-- O profile agora nasce em public.ensure_profile() (identidade Clerk); o
-- trigger que criava profile a cada cadastro em auth.users não é mais
-- necessário e deixaria cadastros diretos no Supabase Auth gerarem profiles
-- órfãos. Não toca em auth.users, nem em nenhum dado de negócio.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
