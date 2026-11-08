-- =============================================================================
-- Datas do negócio no calendário de São Paulo (achado da rodada de uso real, teste1, 08/11/2026):
-- o banco roda em UTC. `current_date` e `timestamptz::date` viram o dia de Greenwich, que depois das
-- 21h (horário de São Paulo) já é o dia seguinte. Efeito: recebimento de venda feito às 21h43 do dia 07
-- ficava com data 08; lançamento sem data, vencimento e número do pedido de compra idem.
--
-- O que muda:
--  1. `public.today_sao_paulo()`: a data de hoje em São Paulo (substitui `current_date`).
--  2. Funções que gravam datas de negócio passam a usar o dia de São Paulo:
--       create_financial_entry (data padrão do lançamento), create_financial_entry_from_sale_payment
--       (recebimento e estorno), pay_accounts_payable (data do pagamento), create_purchase_order (número
--       PC-AAAAMMDD) e receive_purchase_order (emissão da conta a pagar).
--     As funções são reescritas a partir da definição que já existe no banco, trocando só as expressões de
--     data; se o trecho esperado não for encontrado a migração ABORTA (nunca vira um "não faz nada" silencioso).
--  3. Padrão das colunas financial_entries.occurred_on e accounts_payable.issue_date.
--  4. Correção dos registros já gravados com o dia errado: só os gerados automaticamente por recebimento/estorno
--     de venda (occurred_on) e a emissão das contas a pagar. Lançamentos digitados pelo usuário NÃO são tocados.
--
-- Não toca: get_platform_dashboard (gráficos do painel do administrador da plataforma, em UTC).
-- Rollback: supabase/rollback/20261108140000_dates_sao_paulo.down.sql (não desfaz a correção dos registros).
-- Bateria: tests/sql/dates_sao_paulo.sql (somente TEST).
-- =============================================================================
begin;

create or replace function public.today_sao_paulo()
returns date
language sql
stable
parallel safe
set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

revoke all on function public.today_sao_paulo() from public, anon;
grant execute on function public.today_sao_paulo() to authenticated, service_role;

alter table public.financial_entries alter column occurred_on set default public.today_sao_paulo();
alter table public.accounts_payable alter column issue_date set default public.today_sao_paulo();

do $migration$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select * from (values
      ('public.create_financial_entry(public.financial_entry_direction,text,numeric,date,public.sale_payment_method,uuid,uuid,text)',
       'coalesce(p_occurred_on,current_date)',
       'coalesce(p_occurred_on,public.today_sao_paulo())'),
      ('public.create_financial_entry_from_sale_payment()',
       'coalesce(new.paid_at::date,current_date)',
       'coalesce((new.paid_at at time zone ''America/Sao_Paulo'')::date,public.today_sao_paulo())'),
      ('public.create_financial_entry_from_sale_payment()',
       'coalesce(new.updated_at::date,current_date)',
       'coalesce((new.updated_at at time zone ''America/Sao_Paulo'')::date,public.today_sao_paulo())'),
      ('public.pay_accounts_payable(uuid,numeric,public.sale_payment_method,date,text)',
       'p_payment_date date DEFAULT CURRENT_DATE',
       'p_payment_date date DEFAULT public.today_sao_paulo()'),
      ('public.pay_accounts_payable(uuid,numeric,public.sale_payment_method,date,text)',
       'coalesce(p_payment_date,current_date)',
       'coalesce(p_payment_date,public.today_sao_paulo())'),
      ('public.create_purchase_order(uuid,jsonb,timestamp with time zone,date,text)',
       'to_char(current_date,''YYYYMMDD'')',
       'to_char(public.today_sao_paulo(),''YYYYMMDD'')'),
      ('public.receive_purchase_order(uuid,jsonb,text)',
       'round(v_total,2),current_date,v_order.due_date',
       'round(v_total,2),public.today_sao_paulo(),v_order.due_date')
    ) as t(signature, from_text, to_text)
  loop
    v_def := pg_get_functiondef(r.signature::regprocedure);
    -- Já aplicado? (o PostgreSQL imprime o padrão do parâmetro sem o prefixo "public.", então testa as duas formas)
    if position(r.to_text in v_def) > 0
       or position(replace(r.to_text, 'public.today_sao_paulo', 'today_sao_paulo') in v_def) > 0 then
      continue;
    end if;
    v_new := replace(v_def, r.from_text, r.to_text);
    if v_new = v_def then
      raise exception 'Migração abortada: trecho não encontrado em %: %', r.signature, r.from_text;
    end if;
    execute v_new;
  end loop;
end
$migration$;

-- Registros já gravados com o dia de Greenwich: só os automáticos (recebimento/estorno de venda).
update public.financial_entries
set occurred_on = (paid_at at time zone 'America/Sao_Paulo')::date
where source_type in ('sale_payment', 'sale_payment_refund')
  and paid_at is not null
  and occurred_on <> (paid_at at time zone 'America/Sao_Paulo')::date;

update public.accounts_payable
set issue_date = (created_at at time zone 'America/Sao_Paulo')::date
where issue_date <> (created_at at time zone 'America/Sao_Paulo')::date;

commit;
