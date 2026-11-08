-- Rollback de 20261108160000_hr_informal.
-- Remove as funções, tabelas e tipos do RH (fase 1). ATENÇÃO: apaga funcionários, presença, vales e pagamentos de RH.
-- As despesas já lançadas no Financeiro/Caixa por pagamentos e vales de RH NÃO são tocadas (continuam como lançamentos
-- normais, com source_type 'hr_payment'/'hr_adjustment' apontando para linhas que deixam de existir).
begin;

drop function if exists public.hr_cancel_payment(uuid);
drop function if exists public.hr_pay_payment(uuid, public.sale_payment_method, date);
drop function if exists public.hr_close_period(uuid, date, date, date, text);
drop function if exists public.hr_delete_adjustment(uuid);
drop function if exists public.hr_add_adjustment(uuid, public.hr_adjustment_kind, numeric, date, text, public.sale_payment_method);
drop function if exists public.hr_set_attendance(uuid, date[], numeric);
drop function if exists public.hr_period_preview(uuid, date, date);
drop function if exists public.hr_compute_period(uuid, date, date);

drop table if exists public.hr_adjustments;
drop table if exists public.hr_time_entries;
drop table if exists public.hr_payments;
drop table if exists public.hr_employees;

drop function if exists public.hr_employees_audit();
drop function if exists public.hr_employees_guard();
drop function if exists public.hr_manager_company_id();

drop type if exists public.hr_payment_status;
drop type if exists public.hr_adjustment_kind;
drop type if exists public.hr_rate_kind;
drop type if exists public.hr_pay_frequency;
drop type if exists public.hr_employment_mode;

commit;
