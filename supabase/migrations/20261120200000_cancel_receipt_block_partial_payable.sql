-- Estorno de recebimento com conta a pagar PARCIALMENTE paga.
--
-- Problema (achado na 4ª série de testes, Compras): cancel_purchase_receipt só barrava quando a conta a pagar
-- estava 'paid'. Com pagamento parcial ('partial') o estorno seguia: o estoque era retirado e o recibo cancelado,
-- mas a conta a pagar continuava aberta (o UPDATE só cancela status 'open') — dívida sem mercadoria.
-- Correção: também recusa quando a conta está 'partial', com mensagem clara.
--
-- Reescreve a função existente (pg_get_functiondef), é idempotente e aborta se o trecho esperado não existir.
-- Reversão: supabase/rollback/20261120200000_*.down.sql
begin;

do $migration$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.cancel_purchase_receipt(uuid,text)'::regprocedure);

  if position('/* block-partial */' in v_def) > 0 then
    return; -- já aplicado
  end if;

  v_new := replace(
    v_def,
    $old$if v_payable_status='paid' then
    raise exception 'Não é possível cancelar um recebimento cuja conta a pagar já foi quitada.';$old$,
    $new$/* block-partial */ if v_payable_status in ('paid','partial') then
    raise exception 'Não é possível estornar este recebimento: a conta a pagar dele já tem pagamento registrado (total ou parcial).';$new$
  );

  if v_new = v_def then
    raise exception 'Migração abortada: trecho de verificação da conta a pagar não encontrado em cancel_purchase_receipt';
  end if;

  execute v_new;
end
$migration$;

commit;
