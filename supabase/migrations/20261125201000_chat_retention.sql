-- Retenção do assistente de agenda (LGPD): a função chat_purge_old_messages() existia, mas nada a executava.
-- Agora cada novo lote de mensagens dispara a limpeza de TODAS as empresas: mensagens, rascunhos e conversas vazias
-- mais antigos que chat_settings.retention_days (padrão 90 dias).
-- shortcut: depende de alguém usar o chat; se o uso parar, agendar `select public.chat_prune_expired();` na rotina
-- diária do servidor (o banco não tem agendador).

create or replace function public.chat_prune_expired()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.chat_purge_old_messages();

  delete from public.chat_drafts d
   using (select c.id as company_id, coalesce(s.retention_days, 90) as days
            from public.companies c left join public.chat_settings s on s.company_id = c.id) r
   where d.company_id = r.company_id and d.updated_at < now() - make_interval(days => r.days);

  delete from public.chat_sessions cs
   using (select c.id as company_id, coalesce(s.retention_days, 90) as days
            from public.companies c left join public.chat_settings s on s.company_id = c.id) r
   where cs.company_id = r.company_id
     and cs.last_active_at < now() - make_interval(days => r.days)
     and not exists (select 1 from public.chat_messages m where m.session_id = cs.id);
end;
$$;

revoke all on function public.chat_prune_expired() from public, anon, authenticated;
grant execute on function public.chat_prune_expired() to service_role;

create or replace function public.chat_prune_expired_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.chat_prune_expired();
  return null;
end;
$$;

revoke all on function public.chat_prune_expired_trigger() from public, anon, authenticated;

drop trigger if exists chat_messages_retention on public.chat_messages;
create trigger chat_messages_retention
  after insert on public.chat_messages
  for each statement execute function public.chat_prune_expired_trigger();

-- Aplica o prazo já agora.
select public.chat_prune_expired();
