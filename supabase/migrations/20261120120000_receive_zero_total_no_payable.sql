-- Recebimento de compra com total R$ 0,00 (itens de bonificação/amostra, custo zero).
--
-- Problema (achado nas 35 rodadas de teste de Compras): receive_purchase_order sempre inseria uma conta a pagar,
-- mas a tabela exige amount > 0 (accounts_payable_amount_positive). O recebimento falhava por inteiro e o usuário via
-- o erro cru do banco. Correção: só cria a conta a pagar quando o valor recebido é maior que zero; o estoque e o
-- recibo continuam sendo gravados normalmente.
--
-- Mesma técnica da migration 20261108140000: reescreve a função existente (pg_get_functiondef) em vez de copiá-la,
-- é idempotente e aborta se o trecho esperado não for encontrado. Reversão: supabase/rollback/20261120120000_*.down.sql
begin;

do $migration$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.receive_purchase_order(uuid,jsonb,text)'::regprocedure);

  if position('/* zero-payable */' in v_def) > 0 then
    return; -- já aplicado
  end if;

  v_new := regexp_replace(
    v_def,
    '(insert\s+into\s+public\.accounts_payable\s*\(.*?\)\s*values\s*\(.*?\)\s*;)',
    E'/* zero-payable */ if round(v_total,2) > 0 then \\1 end if; /* /zero-payable */',
    's'
  );

  if v_new = v_def then
    raise exception 'Migração abortada: insert em accounts_payable não encontrado em receive_purchase_order';
  end if;

  execute v_new;
end
$migration$;

commit;
