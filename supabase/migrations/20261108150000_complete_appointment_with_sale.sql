-- =============================================================================
-- Concluir atendimento gera a venda (e, se informado, o pagamento), em um clique.
--
-- Antes: "Concluir" só trocava o status do agendamento. A venda, o caixa, o financeiro, os pontos de fidelidade e os
-- relatórios não sabiam que o atendimento aconteceu, e a coluna appointments.sale_id nunca era preenchida.
--
-- Agora: public.complete_appointment(agendamento, forma_de_pagamento opcional, valor opcional), de forma ATÔMICA
-- (tudo ou nada):
--   1. cria a venda (cliente do atendimento, 1 item de serviço com o preço do atendimento e o custo do serviço);
--   2. conclui a venda (mesma regra de complete_sale: totais, auditoria, pontos de fidelidade);
--   3. se vier forma de pagamento e o total for maior que zero, registra o pagamento (add_sale_payment: entra no caixa
--      aberto e no financeiro pelos gatilhos que já existem); sem forma de pagamento a venda fica "a receber";
--   4. marca o atendimento como concluído e liga appointments.sale_id.
-- Idempotente: concluir de novo um atendimento que já tem venda devolve o mesmo atendimento, sem duplicar nada.
-- Só atendimento agendado ou confirmado pode ser concluído. Papéis: dono, administrador e funcionário da empresa.
--
-- Não recalcula atendimentos antigos (concluídos antes desta migração continuam sem venda).
-- Rollback: supabase/rollback/20261108150000_complete_appointment_with_sale.down.sql
-- Bateria: tests/sql/complete_appointment_with_sale.sql (somente TEST).
-- =============================================================================
begin;

create or replace function public.complete_appointment(
  p_appointment_id uuid,
  p_method public.sale_payment_method default null,
  p_amount numeric default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_profile_user_id();
  v_role public.company_role;
  v_row public.appointments;
  v_service public.services;
  v_sale public.sales;
  v_amount numeric(12,2);
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;

  select * into v_row from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;

  select cm.role into v_role
  from public.company_members cm
  where cm.company_id = v_row.company_id and cm.user_id = v_user_id;

  -- Quem não pertence à empresa recebe a mesma resposta de "não existe" (não revela agendamentos de outras empresas).
  if v_role is null then raise exception 'Agendamento não encontrado.'; end if;
  if v_role not in ('owner', 'admin', 'employee') then raise exception 'Acesso negado.'; end if;

  if v_row.status = 'completed' then
    if v_row.sale_id is not null then
      return v_row; -- já concluído com venda: nada a fazer
    end if;
    raise exception 'Este atendimento foi concluído antes da integração com vendas. Registre a venda em Vendas.';
  end if;

  if v_row.status not in ('scheduled', 'confirmed') then
    raise exception 'Só um atendimento agendado ou confirmado pode ser concluído.';
  end if;

  if p_method is null and p_amount is not null then
    raise exception 'Informe a forma de pagamento.';
  end if;

  select * into v_service
  from public.services
  where id = v_row.service_id and company_id = v_row.company_id;
  if not found then raise exception 'Serviço do atendimento não encontrado.'; end if;

  insert into public.sales (company_id, customer_id, user_id, notes)
  values (
    v_row.company_id,
    v_row.customer_id,
    v_user_id,
    'Atendimento de ' || to_char(v_row.starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
  )
  returning * into v_sale;

  insert into public.sale_items (
    company_id, sale_id, item_type, service_id, description,
    quantity, unit_price, unit_cost, discount_amount, subtotal, total_amount
  )
  values (
    v_row.company_id, v_sale.id, 'service', v_service.id, v_service.name,
    1, v_row.price, coalesce(v_service.cost_price, 0), 0, v_row.price, v_row.price
  );

  v_sale := public.complete_sale(v_sale.id);

  if p_method is not null and v_sale.total_amount > 0 then
    v_amount := round(coalesce(p_amount, v_sale.total_amount), 2);
    perform public.add_sale_payment(v_sale.id, p_method, v_amount, null);
  end if;

  update public.appointments
  set status = 'completed',
      cancellation_reason = null,
      sale_id = v_sale.id
  where id = v_row.id
  returning * into v_row;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_row.company_id, v_user_id, 'appointment', v_row.id, 'appointment.completed',
    jsonb_build_object('sale_id', v_sale.id, 'total_amount', v_sale.total_amount, 'method', p_method)
  );

  return v_row;
end;
$$;

revoke all on function public.complete_appointment(uuid, public.sale_payment_method, numeric) from public, anon;
grant execute on function public.complete_appointment(uuid, public.sale_payment_method, numeric) to authenticated, service_role;

commit;
