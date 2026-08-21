-- =============================================================================
-- Migration: 003_harden_function_security.sql
-- Descrição: correções de segurança identificadas pelo Security Advisor
--            do Supabase após aplicar 001 e 002:
--            1) search_path mutável em funções de trigger (risco de
--               sequestro de search_path);
--            2) funções SECURITY DEFINER com EXECUTE concedido a mais
--               roles do que deveriam (anon/authenticated recebem EXECUTE
--               por padrão em toda função nova do schema public neste
--               projeto Supabase — precisa ser revogado explicitamente
--               por função, não basta revogar de PUBLIC).
--
-- Aplicada diretamente no projeto Supabase em produção durante auditoria;
-- este arquivo existe para manter o histórico de migrations do repositório
-- em sincronia com o banco real.
-- =============================================================================

-- 1) Fixar search_path nas funções de trigger que ainda não tinham.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.protect_profile_restricted_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'Não é permitido alterar user_id.';
  end if;

  if new.role is distinct from old.role then
    raise exception 'Não é permitido alterar a própria role. Essa alteração é restrita ao sistema administrativo.';
  end if;

  if new.status is distinct from old.status then
    raise exception 'Não é permitido alterar o próprio status. Essa alteração é restrita ao sistema administrativo.';
  end if;

  return new;
end;
$$;

create or replace function public.protect_customer_company_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'Não é permitido alterar a empresa (company_id) de um cliente.';
  end if;

  return new;
end;
$$;

-- 2) handle_new_user só deve ser invocada pelo trigger on_auth_user_created
-- (execução de trigger não depende de EXECUTE do role da sessão). Não há
-- motivo para expor via RPC pública — revoga de todos os roles de API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3) create_company_with_owner deve ser chamável apenas por usuários
-- autenticados. A função já checa auth.uid() is null internamente, mas
-- revogar EXECUTE de 'anon' explicitamente é defesa em profundidade —
-- sem isso, a rota /rest/v1/rpc/create_company_with_owner fica exposta
-- (ainda que hoje sempre retorne erro para chamadas anônimas).
revoke execute on function public.create_company_with_owner(text, public.business_type) from anon;

-- Nota: public.rls_auto_enable() também aparece no advisor como SECURITY
-- DEFINER exposto a anon/authenticated, mas NÃO foi criada por nenhuma
-- migration do Prime Ges — é um event trigger gerenciado pelo próprio
-- Supabase que habilita RLS automaticamente em toda tabela nova do schema
-- public (mecanismo de proteção, não de risco). Não deve ser alterada por
-- este projeto.
