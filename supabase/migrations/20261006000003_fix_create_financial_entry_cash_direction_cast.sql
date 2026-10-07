-- Bug pré-existente: create_financial_entry com method='cash' quebrava ao
-- inserir em cash_movements (CASE de literais vira text e a coluna
-- direction é enum cash_movement_direction). Cast explícito.
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.create_financial_entry(financial_entry_direction,text,numeric,date,sale_payment_method,uuid,uuid,text)'::regprocedure);
  v_new := replace(
    v_def,
    'case when p_direction=''income'' then ''in'' else ''out'' end',
    '(case when p_direction=''income'' then ''in'' else ''out'' end)::public.cash_movement_direction'
  );
  if v_new = v_def then
    raise exception 'create_financial_entry: trecho esperado nao encontrado';
  end if;
  execute v_new;
end $$;
