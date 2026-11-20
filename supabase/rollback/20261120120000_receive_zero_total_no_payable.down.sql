-- Reverte 20261120120000_receive_zero_total_no_payable.sql: volta a inserir a conta a pagar sempre
-- (recebimento com total zero volta a falhar com accounts_payable_amount_positive).
begin;

do $rollback$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.receive_purchase_order(uuid,jsonb,text)'::regprocedure);

  if position('/* zero-payable */' in v_def) = 0 then
    return; -- nada a reverter
  end if;

  v_new := replace(v_def, '/* zero-payable */ if round(v_total,2) > 0 then ', '');
  v_new := replace(v_new, ' end if; /* /zero-payable */', '');

  if v_new = v_def or position('zero-payable' in v_new) > 0 then
    raise exception 'Reversão abortada: marcadores zero-payable não removidos por completo';
  end if;

  execute v_new;
end
$rollback$;

commit;
