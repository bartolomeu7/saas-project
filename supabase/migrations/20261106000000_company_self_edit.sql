-- =============================================================================
-- Editar a própria empresa (nome e segmento) em Configurações.
--
-- Uma função nova, update_own_company(), chamada pelo usuário logado (role authenticated). Identifica o usuário por
-- current_profile_user_id() (perfil ativo ligado ao id do Clerk no JWT), como as demais RPCs depois da virada para o Clerk. Não cria policy nem libera
-- UPDATE direto na tabela companies: a escrita só acontece por esta função, que:
--   * exige usuário autenticado e usa a MESMA regra de "empresa atual" do app (vínculo mais antigo do usuário);
--   * só deixa owner/admin da empresa alterar (funcionário não);
--   * valida nome (1 a 160 caracteres, como no cadastro; sem espaços nas pontas) e segmento (enum);
--   * NÃO mexe em status, plano nem assinatura (isso continua sendo da plataforma);
--   * grava em audit_logs (nome/segmento antes e depois).
-- Rollback: supabase/rollback/20261106000000_company_self_edit.down.sql
-- =============================================================================
begin;

create or replace function public.update_own_company(
  p_name text,
  p_business_type public.business_type
)
returns public.companies
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := public.current_profile_user_id();
  v_company_id uuid;
  v_role public.company_role;
  v_name text;
  v_old public.companies;
  v_new public.companies;
begin
  if v_actor is null then
    raise exception 'Usuário não autenticado.';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 1 then
    raise exception 'Informe o nome da empresa.';
  end if;
  if char_length(v_name) > 160 then
    raise exception 'O nome da empresa pode ter no máximo 160 caracteres.';
  end if;
  if p_business_type is null then
    raise exception 'Selecione o segmento da empresa.';
  end if;

  select company_id, role into v_company_id, v_role
  from public.company_members
  where user_id = v_actor
  order by created_at asc
  limit 1;

  if v_company_id is null then
    raise exception 'Nenhuma empresa encontrada.';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'Apenas o proprietário ou um administrador da empresa podem alterar estes dados.';
  end if;

  select * into v_old from public.companies where id = v_company_id for update;
  if v_old.id is null then
    raise exception 'Nenhuma empresa encontrada.';
  end if;

  update public.companies
  set name = v_name,
      business_type = p_business_type
  where id = v_company_id
  returning * into v_new;

  -- Só registra quando algo mudou de fato.
  if v_old.name is distinct from v_new.name or v_old.business_type is distinct from v_new.business_type then
    insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (
      v_company_id, v_actor, 'company', v_company_id, 'company.updated',
      jsonb_build_object(
        'previous_name', v_old.name,
        'new_name', v_new.name,
        'previous_business_type', v_old.business_type,
        'new_business_type', v_new.business_type
      )
    );
  end if;

  return v_new;
end;
$function$;

comment on function public.update_own_company(text, public.business_type) is
  'Owner/admin da empresa atual altera nome e segmento. Não toca em status/plano. Audita em audit_logs.';

revoke all on function public.update_own_company(text, public.business_type) from public;
revoke all on function public.update_own_company(text, public.business_type) from anon;
grant execute on function public.update_own_company(text, public.business_type) to authenticated, service_role;

commit;
