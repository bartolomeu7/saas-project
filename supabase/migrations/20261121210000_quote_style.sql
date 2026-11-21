-- =============================================================================
-- Orçamento profissional (Fase 1.5): aparência e extras do PDF por empresa.
-- Guarda em company_settings.operational_preferences -> 'quote_style' (chave própria: não mexe em 'quote', os padrões de validade/condições/rodapé):
--   template ('classic' | 'modern'), brand_color (#rrggbb), intro_text, pix_key, pix_name, show_acceptance.
-- Só proprietário/administrador altera (mesma regra dos dados da empresa). Sem tabela nova.
-- =============================================================================
begin;

create or replace function public.update_company_quote_style(
  p_template text,
  p_brand_color text,
  p_intro_text text,
  p_pix_key text,
  p_pix_name text,
  p_show_acceptance boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_company uuid;
  v_template text := lower(btrim(coalesce(p_template, '')));
  v_color text := lower(btrim(coalesce(p_brand_color, '')));
  v_intro text := btrim(coalesce(p_intro_text, ''));
  v_pix_key text := nullif(btrim(coalesce(p_pix_key, '')), '');
  v_pix_name text := nullif(btrim(coalesce(p_pix_name, '')), '');
begin
  select e.user_id, e.company_id into v_user, v_company from public._company_editor() e;

  if v_template not in ('classic', 'modern') then
    raise exception 'Modelo de orçamento inválido.';
  end if;
  if v_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'Cor da marca inválida: use o formato #rrggbb.';
  end if;
  if char_length(v_intro) > 600 then
    raise exception 'O texto de apresentação pode ter no máximo 600 caracteres.';
  end if;
  if v_pix_key is not null and v_pix_key !~ '^[A-Za-z0-9@+._%-]{1,77}$' then
    raise exception 'Chave Pix inválida.';
  end if;
  if v_pix_name is not null and char_length(v_pix_name) > 25 then
    raise exception 'O nome do recebedor do Pix pode ter no máximo 25 caracteres.';
  end if;
  if p_show_acceptance is null then
    raise exception 'Informe se o bloco de aceite aparece no PDF.';
  end if;

  insert into public.company_settings (company_id, updated_by) values (v_company, v_user) on conflict (company_id) do nothing;

  update public.company_settings
     set operational_preferences = jsonb_set(
           coalesce(operational_preferences, '{}'::jsonb), '{quote_style}',
           jsonb_build_object(
             'template', v_template,
             'brand_color', v_color,
             'intro_text', v_intro,
             'pix_key', v_pix_key,
             'pix_name', v_pix_name,
             'show_acceptance', p_show_acceptance),
           true),
         updated_at = now(), updated_by = v_user
   where company_id = v_company;

  -- a chave Pix completa não vai para o log de auditoria
  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'company', v_company, 'company.quote_style_updated',
          jsonb_build_object('template', v_template, 'brand_color', v_color, 'pix_configured', v_pix_key is not null, 'show_acceptance', p_show_acceptance));
end;
$function$;

revoke all on function public.update_company_quote_style(text, text, text, text, text, boolean) from public, anon;
grant execute on function public.update_company_quote_style(text, text, text, text, text, boolean) to authenticated, service_role;

-- o PostgREST só enxerga funções novas depois de recarregar o cache de esquema
notify pgrst, 'reload schema';

commit;
