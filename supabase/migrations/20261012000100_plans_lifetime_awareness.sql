-- =============================================================================
-- Missão 08 — o CRUD de planos do Admin passa a reconhecer o plano vitalício.
--   * list_platform_plans devolve a coluna `lifetime`;
--   * platform_validate_plan_fields aceita duração vazia também para planos vitalícios;
--   * update_platform_plan impede preço/duração/trial num plano vitalício com mensagem clara (o CHECK da tabela é a última barreira);
-- O plano LIFETIME pode ser desativado por super_admin (isso bloqueia NOVAS concessões vitalícias; as existentes continuam).
-- Mesmo mecanismo de reescrita guiada da migration 20261012000000: cada padrão precisa aparecer exatamente o número esperado de vezes.
-- ROLLBACK: supabase/rollback/20261012000100_plans_lifetime_awareness.down.sql
-- =============================================================================
create or replace function pg_temp.rewrite_fn(p_sig text, p_from text[], p_to text[], p_expected int[], p_drop boolean default false)
 returns void
 language plpgsql
as $rw$
declare
  v_def text;
  v_cnt int;
  i int;
begin
  v_def := pg_get_functiondef(p_sig::regprocedure);
  for i in 1 .. array_length(p_from, 1) loop
    v_cnt := (length(v_def) - length(replace(v_def, p_from[i], ''))) / length(p_from[i]);
    if v_cnt <> p_expected[i] then
      raise exception 'rewrite %: padrão #% esperado % vez(es), encontrado %', p_sig, i, p_expected[i], v_cnt;
    end if;
    v_def := replace(v_def, p_from[i], p_to[i]);
  end loop;
  if p_drop then
    execute 'drop function ' || p_sig;
  end if;
  execute v_def;
end;
$rw$;

select pg_temp.rewrite_fn('public.list_platform_plans()',
  array[
    $$is_protected boolean)$$,
    $$p.code in ('FREE_TRIAL', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM')$$
  ],
  array[
    $$is_protected boolean, lifetime boolean)$$,
    $$p.code in ('FREE_TRIAL', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'), p.lifetime$$
  ],
  array[1, 1], true);
revoke all on function public.list_platform_plans() from public, anon;
grant execute on function public.list_platform_plans() to authenticated;

select pg_temp.rewrite_fn('public.platform_validate_plan_fields(text,numeric,integer,integer,integer,text)',
  array[$$p_code <> 'CUSTOM'$$],
  array[$$p_code not in ('CUSTOM', 'LIFETIME')$$],
  array[1]);

select pg_temp.rewrite_fn('public.update_platform_plan(uuid,text,text,numeric,integer,public.billing_interval,integer,boolean,boolean,boolean,boolean,boolean,integer)',
  array[$$perform public.platform_validate_plan_fields(p_name, p_price, p_access_duration_days, p_additional_user_limit, p_sort_order, v_old.code);$$],
  array[$$perform public.platform_validate_plan_fields(p_name, p_price, p_access_duration_days, p_additional_user_limit, p_sort_order, v_old.code);
  if v_old.lifetime and (p_price is not null or p_access_duration_days is not null or p_trial) then
    raise exception 'O plano vitalício não tem preço, duração nem período de teste.';
  end if;$$],
  array[1]);
