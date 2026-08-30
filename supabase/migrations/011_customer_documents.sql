-- =============================================================================
-- Migration: 011_customer_documents.sql
-- Descrição: Etapa 1B — documentos de clientes via Supabase Storage.
--            Cria a tabela public.customer_documents, o bucket privado
--            "customer-documents" e as policies de Storage necessárias.
--            Migration puramente aditiva: nenhuma tabela/coluna anterior
--            alterada, nenhuma migration anterior tocada.
--
-- Reaproveita o mesmo padrão de RLS de todas as outras tabelas de negócio
-- (company_id IN (SELECT company_id FROM company_members WHERE user_id =
-- auth.uid())) — tanto na tabela quanto nas policies de storage.objects.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela public.customer_documents
-- -----------------------------------------------------------------------------
create table public.customer_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  file_type text not null,
  file_size bigint not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint customer_documents_file_size_valid
    check (file_size > 0 and file_size <= 10485760),
  constraint customer_documents_file_type_allowed
    check (file_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp'))
);

comment on table public.customer_documents is
  'Documentos anexados a um cliente (arquivo em Supabase Storage, bucket customer-documents). Registro imutável: sem policy de UPDATE — "substituir" é sempre excluir + enviar novo.';
comment on column public.customer_documents.file_path is
  'Caminho do objeto no bucket customer-documents: {company_id}/{customer_id}/{uuid}.{ext}. Nunca derivado do nome original enviado pelo usuário.';
comment on column public.customer_documents.file_name is
  'Nome original do arquivo, somente para exibição — nunca usado para montar caminho, comando ou URL.';
comment on column public.customer_documents.file_type is
  'MIME type validado no servidor contra a allowlist antes do insert (ver constraint customer_documents_file_type_allowed).';
comment on column public.customer_documents.customer_id is
  'ON DELETE CASCADE remove a linha se o cliente for fisicamente excluído — mas isso NÃO remove o objeto correspondente no Storage (cascade do Postgres não alcança buckets). Hoje a exclusão de cliente no app é lógica (status = inactive); se um hard-delete de cliente for exposto no futuro, a rotina precisa apagar os objetos de Storage explicitamente antes.';

create index customer_documents_company_customer_idx
  on public.customer_documents (company_id, customer_id);

alter table public.customer_documents enable row level security;

create policy customer_documents_select_own_company
  on public.customer_documents for select
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

create policy customer_documents_insert_own_company
  on public.customer_documents for insert
  with check (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

create policy customer_documents_delete_own_company
  on public.customer_documents for delete
  using (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

-- Nenhuma policy de UPDATE: documento é imutável depois de criado.

-- -----------------------------------------------------------------------------
-- 2. Bucket de Storage: customer-documents (privado)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-documents',
  'customer-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Policies de storage.objects — isolamento por empresa via o caminho do
--    objeto ({company_id}/{customer_id}/{uuid}.{ext}). storage.foldername(name)
--    retorna os segmentos de pasta do objeto; [1] é sempre o company_id.
-- -----------------------------------------------------------------------------
create policy customer_documents_storage_select_own_company
  on storage.objects for select
  using (
    bucket_id = 'customer-documents'
    and (storage.foldername(name))[1] in (
      select cm.company_id::text from public.company_members cm where cm.user_id = auth.uid()
    )
  );

create policy customer_documents_storage_insert_own_company
  on storage.objects for insert
  with check (
    bucket_id = 'customer-documents'
    and (storage.foldername(name))[1] in (
      select cm.company_id::text from public.company_members cm where cm.user_id = auth.uid()
    )
  );

create policy customer_documents_storage_delete_own_company
  on storage.objects for delete
  using (
    bucket_id = 'customer-documents'
    and (storage.foldername(name))[1] in (
      select cm.company_id::text from public.company_members cm where cm.user_id = auth.uid()
    )
  );

-- Nenhuma policy de UPDATE em storage.objects: substituir um objeto no lugar
-- nunca é permitido, mesmo para a própria empresa.
