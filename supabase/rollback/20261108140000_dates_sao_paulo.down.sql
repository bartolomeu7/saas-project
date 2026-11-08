-- Rollback de 20261108140000_dates_sao_paulo.
-- Volta as funções e os padrões de coluna ao `current_date` (dia de Greenwich) e remove today_sao_paulo().
-- NÃO desfaz a correção dos registros antigos (occurred_on dos recebimentos/estornos e issue_date das contas a pagar):
-- eles ficam com o dia de São Paulo, que é o correto.
begin;

alter table public.financial_entries alter column occurred_on set default current_date;
alter table public.accounts_payable alter column issue_date set default current_date;

do $rollback$
declare
  r record;
  v_def text;
  v_new text;
  v_from text;
begin
  for r in
    select * from (values
      ('public.create_financial_entry(public.financial_entry_direction,text,numeric,date,public.sale_payment_method,uuid,uuid,text)',
       'coalesce(p_occurred_on,public.today_sao_paulo())',
       'coalesce(p_occurred_on,current_date)'),
      ('public.create_financial_entry_from_sale_payment()',
       'coalesce((new.paid_at at time zone ''America/Sao_Paulo'')::date,public.today_sao_paulo())',
       'coalesce(new.paid_at::date,current_date)'),
      ('public.create_financial_entry_from_sale_payment()',
       'coalesce((new.updated_at at time zone ''America/Sao_Paulo'')::date,public.today_sao_paulo())',
       'coalesce(new.updated_at::date,current_date)'),
      ('public.pay_accounts_payable(uuid,numeric,public.sale_payment_method,date,text)',
       'p_payment_date date DEFAULT public.today_sao_paulo()',
       'p_payment_date date DEFAULT CURRENT_DATE'),
      ('public.pay_accounts_payable(uuid,numeric,public.sale_payment_method,date,text)',
       'coalesce(p_payment_date,public.today_sao_paulo())',
       'coalesce(p_payment_date,current_date)'),
      ('public.create_purchase_order(uuid,jsonb,timestamp with time zone,date,text)',
       'to_char(public.today_sao_paulo(),''YYYYMMDD'')',
       'to_char(current_date,''YYYYMMDD'')'),
      ('public.receive_purchase_order(uuid,jsonb,text)',
       'round(v_total,2),public.today_sao_paulo(),v_order.due_date',
       'round(v_total,2),current_date,v_order.due_date')
    ) as t(signature, from_text, to_text)
  loop
    v_def := pg_get_functiondef(r.signature::regprocedure);
    -- O PostgreSQL imprime o padrão do parâmetro sem o prefixo "public." — aceita as duas formas.
    v_from := r.from_text;
    if position(v_from in v_def) = 0 then
      v_from := replace(v_from, 'public.today_sao_paulo', 'today_sao_paulo');
    end if;
    v_new := replace(v_def, v_from, r.to_text);
    if v_new <> v_def then
      execute v_new;
    end if;
  end loop;

  -- Nenhuma das funções pode continuar dependendo do helper (senão o DROP abaixo falha).
  for r in
    select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('create_financial_entry', 'create_financial_entry_from_sale_payment',
                        'pay_accounts_payable', 'create_purchase_order', 'receive_purchase_order')
      and pg_get_functiondef(p.oid) like '%today_sao_paulo%'
  loop
    raise exception 'Rollback abortado: % ainda usa today_sao_paulo()', r.proname;
  end loop;
end
$rollback$;

drop function if exists public.today_sao_paulo();

commit;
