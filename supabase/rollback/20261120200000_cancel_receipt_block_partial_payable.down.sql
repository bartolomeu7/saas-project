-- Reverte 20261120200000_cancel_receipt_block_partial_payable.sql: volta a barrar só a conta 'paid'.
begin;

do $rollback$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.cancel_purchase_receipt(uuid,text)'::regprocedure);

  if position('/* block-partial */' in v_def) = 0 then
    return; -- nada a reverter
  end if;

  v_new := replace(
    v_def,
    $new$/* block-partial */ if v_payable_status in ('paid','partial') then
    raise exception 'Não é possível estornar este recebimento: a conta a pagar dele já tem pagamento registrado (total ou parcial).';$new$,
    $old$if v_payable_status='paid' then
    raise exception 'Não é possível cancelar um recebimento cuja conta a pagar já foi quitada.';$old$
  );

  if v_new = v_def or position('block-partial' in v_new) > 0 then
    raise exception 'Reversão abortada: texto original não restaurado por completo';
  end if;

  execute v_new;
end
$rollback$;

commit;
