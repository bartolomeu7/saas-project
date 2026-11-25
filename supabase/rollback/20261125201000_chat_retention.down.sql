-- Volta a limpeza automática do assistente. Não recupera registros já apagados.
drop trigger if exists chat_messages_retention on public.chat_messages;
drop function if exists public.chat_prune_expired_trigger();
drop function if exists public.chat_prune_expired();
