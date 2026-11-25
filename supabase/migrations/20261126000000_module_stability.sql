-- Estabilidade dos módulos depois da mudança para o servidor próprio:
--  1) Anexos de clientes: o servidor não tem serviço de arquivos (o envio falhava sempre). O conteúdo passa a ficar no
--     banco, como o logo da empresa; assim também entra nas cópias de segurança e some junto com o documento.
--  2) Rotinas diárias: a validade dos pontos de fidelidade e a limpeza do assistente não tinham quem as executasse.

begin;

create table if not exists public.customer_document_files (
  document_id uuid primary key references public.customer_documents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  -- 5 MB de arquivo viram até 6.990.508 caracteres em base64
  data_base64 text not null check (char_length(data_base64) between 1 and 7000000)
);

alter table public.customer_document_files enable row level security;
revoke all on table public.customer_document_files from public, anon, authenticated;
grant select, insert on table public.customer_document_files to authenticated;
grant select, insert, delete on table public.customer_document_files to service_role;

drop policy if exists customer_document_files_select_member on public.customer_document_files;
create policy customer_document_files_select_member on public.customer_document_files for select to authenticated
  using (exists (
    select 1 from public.company_members cm
     where cm.company_id = customer_document_files.company_id
       and cm.user_id = (select public.current_profile_user_id())
  ));

-- só anexa a um documento da própria empresa
drop policy if exists customer_document_files_insert_member on public.customer_document_files;
create policy customer_document_files_insert_member on public.customer_document_files for insert to authenticated
  with check (
    exists (
      select 1 from public.company_members cm
       where cm.company_id = customer_document_files.company_id
         and cm.user_id = (select public.current_profile_user_id())
    )
    and exists (
      select 1 from public.customer_documents d
       where d.id = customer_document_files.document_id and d.company_id = customer_document_files.company_id
    )
  );

-- ------------------------------------------------------------------ rotinas diárias
create table if not exists public.daily_maintenance (
  id boolean primary key default true check (id),
  ran_on date not null
);
alter table public.daily_maintenance enable row level security;
revoke all on table public.daily_maintenance from public, anon, authenticated;

-- Chamada pelo sinal de presença de quem está usando o sistema; só trabalha na primeira chamada de cada dia.
-- shortcut: sem ninguém usando, nada roda (e ninguém resgata pontos); agendar no servidor se um dia isso importar.
create or replace function public.run_daily_maintenance()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into public.daily_maintenance as m (id, ran_on) values (true, v_today)
  on conflict (id) do update set ran_on = excluded.ran_on where m.ran_on < excluded.ran_on;
  if not found then
    return false;
  end if;

  perform public.expire_loyalty_points_batch();
  perform public.chat_prune_expired();
  return true;
end;
$$;

revoke all on function public.run_daily_maintenance() from public, anon;
grant execute on function public.run_daily_maintenance() to authenticated, service_role;

commit;
