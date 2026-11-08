-- Rollback de 20261108150000_complete_appointment_with_sale.
-- Remove a função complete_appointment. Vendas e atendimentos já criados/concluídos por ela NÃO são tocados
-- (a venda continua existindo e o atendimento continua ligado a ela por appointments.sale_id).
begin;

drop function if exists public.complete_appointment(uuid, public.sale_payment_method, numeric);

commit;
