-- Itens baixos da bateria de Operação (26/11): documento sem números pode repetir entre fornecedores, inativar e
-- reativar fornecedor fica no histórico e produto desativado não aceita ajuste de estoque.
-- Não altera dados existentes. Rollback: supabase/rollback/20261126140000_operacao_baixos.down.sql
begin;

-- "ISENTO" e parecidos não são documento: só o que tem número precisa ser único
drop index if exists public.suppliers_document_per_company_unique;
create unique index suppliers_document_per_company_unique
  on public.suppliers (company_id, document)
  where document ~ '[0-9]';

create or replace function public.audit_supplier_status()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (new.company_id, public.current_profile_user_id(), 'supplier', new.id,
          case when new.status = 'active' then 'supplier.reactivated' else 'supplier.deactivated' end,
          jsonb_build_object('name', new.name));
  return new;
end
$function$;

revoke all on function public.audit_supplier_status() from public, anon, authenticated;

drop trigger if exists suppliers_audit_status on public.suppliers;
create trigger suppliers_audit_status
  after update of status on public.suppliers
  for each row
  when (old.status is distinct from new.status)
  execute function public.audit_supplier_status();

CREATE OR REPLACE FUNCTION public.adjust_product_stock(p_product_id uuid, p_new_quantity numeric, p_reason text)
 RETURNS products
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := public.current_profile_user_id();
  v_company_id uuid;
  v_role public.company_role;
  v_product public.products;
  v_previous numeric(12,3);
  v_delta numeric(12,3);
  v_direction public.stock_movement_direction;
  v_event_id uuid := gen_random_uuid();
  v_reason text;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_new_quantity is null or p_new_quantity < 0 then
    raise exception 'A quantidade de estoque não pode ser negativa.';
  end if;

  v_reason := nullif(trim(p_reason), '');
  if v_reason is null then
    raise exception 'Informe o motivo do ajuste de estoque.';
  end if;

  if char_length(v_reason) > 500 then
    raise exception 'O motivo do ajuste deve ter no máximo 500 caracteres.';
  end if;

  select cm.company_id, cm.role
    into v_company_id, v_role
  from public.company_members cm
  where cm.user_id = v_user_id
  order by cm.created_at asc
  limit 1;

  if v_company_id is null then
    raise exception 'Nenhuma empresa encontrada para o usuário atual.';
  end if;

  if v_role not in ('owner','admin') then
    raise exception 'Apenas owner/admin podem ajustar estoque manualmente.';
  end if;

  select *
    into v_product
  from public.products
  where id = p_product_id
    and company_id = v_company_id
  for update;

  if v_product is null then
    raise exception 'Produto não encontrado.';
  end if;

  if v_product.status <> 'active' then
    raise exception 'Reative o produto antes de ajustar o estoque.';
  end if;

  v_previous := v_product.stock_quantity;
  v_delta := round(p_new_quantity - v_previous, 3);

  if v_delta = 0 then
    raise exception 'O novo estoque é igual ao estoque atual.';
  end if;

  v_direction := case when v_delta > 0 then 'in' else 'out' end;

  update public.products
  set stock_quantity = p_new_quantity
  where id = v_product.id;

  insert into public.stock_movements(
    company_id,
    product_id,
    direction,
    quantity,
    stock_before,
    stock_after,
    reason,
    source,
    reference_id,
    created_by
  )
  values(
    v_company_id,
    v_product.id,
    v_direction,
    abs(v_delta),
    v_previous,
    p_new_quantity,
    v_reason,
    'manual',
    v_event_id,
    v_user_id
  );

  insert into public.audit_logs(
    company_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    metadata
  )
  values(
    v_company_id,
    v_user_id,
    'product',
    v_product.id,
    'product_stock_adjusted',
    jsonb_build_object(
      'previousStock', v_previous,
      'newStock', p_new_quantity,
      'difference', v_delta,
      'reason', v_reason,
      'stockMovementId', v_event_id
    )
  );

  select * into v_product
  from public.products
  where id = v_product.id;

  return v_product;
end;
$function$;

commit;
