-- Rollback da fundação do Chat AI: remove só o que a migration criou (nenhuma tabela de negócio é tocada).
begin;
drop function if exists public.chat_purge_old_messages();
drop function if exists public.chat_expire_due_drafts();
drop table if exists public.chat_usage;
drop table if exists public.chat_feedback;
drop table if exists public.chat_messages;
drop table if exists public.chat_drafts;
drop table if exists public.chat_sessions;
drop table if exists public.chat_settings;
drop function if exists public.chat_owner_company_id();
drop function if exists public.chat_member_company_id();
commit;
