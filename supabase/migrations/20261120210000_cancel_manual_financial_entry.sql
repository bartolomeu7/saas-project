-- Estorno de lançamento manual do Financeiro (receita/despesa avulsa).
--
-- Problema (4ª série de testes, Financeiro): um lançamento digitado errado (valor, tipo, categoria) não tinha como ser
-- corrigido — a tela só criava lançamentos e nada os cancelava, então o resultado do mês ficava errado para sempre.
--
-- cancel_manual_financial_entry: só owner/admin, só lançamentos manuais (source_type nulo: os de venda, compra, RH
-- e caixa têm o próprio estorno), só 'posted'. Se foi em dinheiro, grava a saída/entrada inversa no caixa aberto
-- (exige caixa aberto, como o lançamento original). Deixa o lançamento 'cancelled' (some do resultado) e registra auditoria.
-- Reversão: supabase/rollback/20261120210000_*.down.sql
begin;

create or replace function public.cancel_manual_financial_entry(p_entry_id uuid, p_reason text default null)
returns public.financial_entries
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := public.current_profile_user_id();
  v_company_id uuid;
  v_role public.company_role;
  v_entry public.financial_entries;
  v_cash_register_id uuid;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;

  select company_id, role into v_company_id, v_role
  from public.company_members
  where user_id = v_user_id
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada para o usuário atual.'; end if;
  if v_role not in ('owner', 'admin') then raise exception 'Apenas owner/admin podem estornar lançamentos.'; end if;

  select * into v_entry
  from public.financial_entries
  where id = p_entry_id and company_id = v_company_id
  for update;

  if v_entry.id is null then raise exception 'Lançamento não encontrado.'; end if;
  if v_entry.status <> 'posted' then raise exception 'Este lançamento já foi estornado.'; end if;
  if v_entry.source_type is not null then
    raise exception 'Este lançamento veio de uma venda, compra ou folha e deve ser estornado na origem.';
  end if;

  if v_entry.method = 'cash' then
    select id into v_cash_register_id
    from public.cash_registers
    where company_id = v_company_id and status = 'open'
    for update;

    if v_cash_register_id is null then
      raise exception 'Abra o caixa antes de estornar um lançamento em dinheiro.';
    end if;

    insert into public.cash_movements(company_id, cash_register_id, direction, amount, method, description, source, created_by)
    values (
      v_company_id,
      v_cash_register_id,
      (case when v_entry.direction = 'income' then 'out' else 'in' end)::public.cash_movement_direction,
      v_entry.amount,
      'cash',
      left('Estorno: ' || v_entry.description, 200),
      'manual',
      v_user_id
    );
  end if;

  update public.financial_entries set status = 'cancelled' where id = v_entry.id returning * into v_entry;

  insert into public.audit_logs(company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_company_id, v_user_id, 'financial_entry', v_entry.id, 'financial_entry.cancelled',
    jsonb_build_object('reason', nullif(trim(p_reason), ''), 'amount', v_entry.amount, 'method', v_entry.method)
  );

  return v_entry;
end;
$function$;

revoke all on function public.cancel_manual_financial_entry(uuid, text) from public, anon;
grant execute on function public.cancel_manual_financial_entry(uuid, text) to authenticated, service_role;

commit;
