-- Corrige a idempotência do ledger da Fase 1:
-- uma venda pode conter vários produtos e ajustes manuais do mesmo produto
-- podem ocorrer várias vezes. Só movimentos de venda/cancelamento usam referência.
drop index if exists public.stock_movements_reference_unique;
create unique index stock_movements_reference_product_unique on public.stock_movements(source,reference_id,product_id) where reference_id is not null;

create or replace function public.record_stock_movement_from_audit() returns trigger language plpgsql security definer set search_path=public as $$
declare p uuid; b numeric; a numeric; d numeric; s public.stock_movement_source; dir public.stock_movement_direction; ref uuid;
begin
 if new.action not in ('product_stock_adjusted','sale.stock_adjusted') then return new; end if;
 p:=coalesce(nullif(new.metadata->>'product_id','')::uuid,case when new.entity_type='product' then new.entity_id else null end);
 if p is null then return new; end if;
 b:=coalesce(nullif(new.metadata->>'previousStock','')::numeric,nullif(new.metadata->>'stock_before','')::numeric);
 a:=coalesce(nullif(new.metadata->>'newStock','')::numeric,nullif(new.metadata->>'stock_after','')::numeric);
 d:=abs(coalesce(a,0)-coalesce(b,0)); if d<=0 then return new; end if;
 if new.action='sale.stock_adjusted' then
   if coalesce(new.metadata->>'reason','')='sale_cancelled' then s:='sale_cancellation'; dir:='in'; else s:='sale'; dir:='out'; end if;
   ref:=new.entity_id;
 else
   s:='manual'; dir:=case when coalesce(a,0)>=coalesce(b,0) then 'in' else 'out' end; ref:=null;
 end if;
 insert into public.stock_movements(company_id,product_id,direction,quantity,stock_before,stock_after,reason,source,reference_id,created_by)
 values(new.company_id,p,dir,d,coalesce(b,0),coalesce(a,0),coalesce(new.metadata->>'reason',new.action),s,ref,new.actor_user_id)
 on conflict do nothing;
 return new;
end $$;
