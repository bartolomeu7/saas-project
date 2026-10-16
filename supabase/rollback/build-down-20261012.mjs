/**
 * Gera os scripts de rollback das migrations 20261012* A PARTIR DAS DEFINIÇÕES ANTERIORES versionadas no repositório
 * (nada é digitado à mão, e a prova em TEST compara o resultado com o catálogo de Production):
 *
 *   node supabase/rollback/build-down-20261012.mjs
 *
 * Saída: supabase/rollback/20261012000200_*.down.sql, 20261012000100_*.down.sql e 20261012000000_*.down.sql.
 * Ordem de execução do rollback: 000200 -> 000100 -> 000000 (depois, se for o caso, os de 20261011*).
 */
import fs from "node:fs";

const migrations = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const out = (name, sql) => fs.writeFileSync(new URL(`./${name}`, import.meta.url), sql);

/** Extrai `create [or replace] function public.<name>(...) ... $function$;|$$;` e os revoke/grant dessa função. */
function extractFunction(file, name) {
  const text = migrations(file);
  const startRe = new RegExp(`create (or replace )?function public\\.${name}\\(`, "i");
  const m = startRe.exec(text);
  if (!m) throw new Error(`função ${name} não encontrada em ${file}`);
  const rest = text.slice(m.index);
  const endRe = /\n\$(function)?\$;\s*\n/;
  const e = endRe.exec(rest);
  if (!e) throw new Error(`fim da função ${name} não encontrado em ${file}`);
  const body = rest.slice(0, e.index + e[0].length).replace(/^create function/i, "create or replace function");
  const privs = [...text.matchAll(new RegExp(`(revoke|grant)\\s+[^;]*?on function public\\.${name}\\([^;]*;`, "gi"))].map((x) => x[0]);
  return `${body.trimEnd()}\n${privs.join("\n")}\n`;
}

const HELPER = `create or replace function pg_temp.rewrite_fn(p_sig text, p_from text[], p_to text[], p_expected int[], p_drop boolean default false)
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
`;

// ------------------------------------------------------------- 000200
out("20261012000200_admin_company_members_and_reconciliation.down.sql", `-- ROLLBACK de 20261012000200_admin_company_members_and_reconciliation.sql (gerado por build-down-20261012.mjs).
-- Não apaga linhas de auditoria já gravadas. Executar como postgres, nesta ordem: 000200 -> 000100 -> 000000.
begin;
drop function if exists public.admin_add_company_member(uuid, text, public.company_role, text, uuid);
drop function if exists public.admin_set_company_member_role(uuid, uuid, public.company_role, text);
drop function if exists public.admin_remove_company_member(uuid, uuid, text);
drop function if exists public.admin_transfer_company_ownership(uuid, uuid, text, uuid);
drop function if exists public.platform_reconcile_candidates(integer, integer);
drop function if exists public.admin_audit_reconciliation(integer, integer, integer, integer);
commit;
`);

// ------------------------------------------------------------- 000100
out("20261012000100_plans_lifetime_awareness.down.sql", `-- ROLLBACK de 20261012000100_plans_lifetime_awareness.sql (gerado por build-down-20261012.mjs).
begin;
${HELPER}
select pg_temp.rewrite_fn('public.list_platform_plans()',
  array[$$is_protected boolean, lifetime boolean)$$, $$p.code in ('FREE_TRIAL', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'), p.lifetime$$],
  array[$$is_protected boolean)$$, $$p.code in ('FREE_TRIAL', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM')$$],
  array[1, 1], true);
revoke all on function public.list_platform_plans() from public, anon;
grant execute on function public.list_platform_plans() to authenticated;

select pg_temp.rewrite_fn('public.platform_validate_plan_fields(text,numeric,integer,integer,integer,text)',
  array[$$p_code not in ('CUSTOM', 'LIFETIME')$$], array[$$p_code <> 'CUSTOM'$$], array[1]);

select pg_temp.rewrite_fn('public.update_platform_plan(uuid,text,text,numeric,integer,public.billing_interval,integer,boolean,boolean,boolean,boolean,boolean,integer)',
  array[$$
  if v_old.lifetime and (p_price is not null or p_access_duration_days is not null or p_trial) then
    raise exception 'O plano vitalício não tem preço, duração nem período de teste.';
  end if;$$],
  array[$$$$],
  array[1]);
commit;
`);

// ------------------------------------------------------------- 000000
const restore = [
  ["20261009000000_admin_platform_core.sql", "platform_apply_access"],
  ["20261009020000_admin_billing_ops.sql", "platform_extend_access_core"],
  ["20261009020000_admin_billing_ops.sql", "admin_assign_plan"],
  ["20261009020000_admin_billing_ops.sql", "admin_reactivate_subscription"],
  ["20261009020000_admin_billing_ops.sql", "admin_adjust_access_expiry"],
  ["20261009020000_admin_billing_ops.sql", "admin_cancel_subscription"],
  ["20261009030000_admin_insights_tools.sql", "admin_mark_expired_subscriptions"],
  ["20261009030000_admin_insights_tools.sql", "admin_sync_company_entitlements"],
  ["20261009020000_admin_billing_ops.sql", "admin_record_manual_payment"],
  ["009_billing_subscriptions.sql", "get_public_plans"],
  ["20261009010000_admin_users_companies.sql", "get_platform_company_detail"],
  ["20261009030000_admin_insights_tools.sql", "get_platform_dashboard"],
  ["20261011000000_billing_hardening.sql", "confirm_subscription_payment"],
  ["20261011000000_billing_hardening.sql", "platform_diagnostics"],
];

let down = `-- ROLLBACK de 20261012000000_lifetime_access_and_license_ops.sql (gerado por build-down-20261012.mjs).
-- Volta ao estado ANTERIOR a esta migration (o de 20261011*). RECUSA rodar se existir acesso vitalício: converta-o antes
-- (admin_assign_plan por super_admin, com prazo) — senão a coluna expires_at não pode voltar a ser NOT NULL.
-- Executar como postgres, depois de 20261012000200 e 20261012000100.
begin;

do $guard$
begin
  if exists (select 1 from public.subscriptions where lifetime) then
    raise exception 'Existem assinaturas vitalícias. Converta-as para um plano com prazo antes do rollback.';
  end if;
end $guard$;

drop function if exists public.admin_grant_license(uuid, text, uuid, integer, text, uuid);
drop function if exists public.admin_record_manual_payment(uuid, uuid, numeric, text, text, text, timestamptz, boolean, uuid);
drop function if exists public.platform_apply_access(uuid, uuid, public.subscription_status, timestamptz, timestamptz, text, boolean);

`;
for (const [file, name] of restore) {
  down += `-- ---- ${name} (definição anterior, de ${file})\n${extractFunction(file, name)}\n`;
}

down += `${HELPER}
-- ---- leituras: desfaz a reescrita guiada (padrões invertidos, com a mesma contagem exata); company_detail e dashboard são restaurados do texto versionado
select pg_temp.rewrite_fn('public.get_platform_user_detail(uuid)',
  array[$$'expires_at', s.expires_at, 'lifetime', s.lifetime,$$, $$s.status in ('trialing', 'active') and (s.lifetime or s.expires_at > now()),$$, $$'days_left', case when s.lifetime then null else greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::int end,$$, $$'access_duration_days', pl.access_duration_days, 'trial', pl.trial, 'lifetime', pl.lifetime)$$],
  array[$$'expires_at', s.expires_at,$$, $$s.status in ('trialing', 'active') and s.expires_at > now(),$$, $$'days_left', greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::int,$$, $$'access_duration_days', pl.access_duration_days, 'trial', pl.trial)$$],
  array[1, 1, 1, 1]);
select pg_temp.rewrite_fn('public.list_platform_admin_users(text,public.user_status,public.user_role,text,text,text,text,integer,integer)',
  array[$$(s.lifetime or s.expires_at > now())$$], array[$$s.expires_at > now()$$], array[2]);
select pg_temp.rewrite_fn('public.list_platform_admin_companies(text,public.company_status,text,text,text,integer,integer)',
  array[$$(s.lifetime or s.expires_at > now())$$], array[$$s.expires_at > now()$$], array[2]);
select pg_temp.rewrite_fn('public.list_platform_plans()',
  array[$$(s.lifetime or s.expires_at > now())$$], array[$$s.expires_at > now()$$], array[1]);
select pg_temp.rewrite_fn('public.get_platform_admin_overview()',
  array[$$(s.lifetime or s.expires_at > now())$$, $$(not s.lifetime and s.expires_at <= now())$$],
  array[$$s.expires_at > now()$$, $$s.expires_at <= now()$$], array[2, 1]);
select pg_temp.rewrite_fn('public.list_platform_subscriptions(text,text,text,text,integer,text,integer,integer)',
  array[
    $$expires_at timestamp with time zone, lifetime boolean, days_left integer,$$,
    $$when s.status in ('trialing', 'active') and (s.lifetime or s.expires_at > now()) then s.status::text$$,
    $$case when s.lifetime then null else greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::integer end as b_days,
      s.lifetime as b_lifetime,$$,
    $$b.b_starts, b.b_expires, b.b_lifetime, b.b_days, b.b_provider,$$
  ],
  array[
    $$expires_at timestamp with time zone, days_left integer,$$,
    $$when s.status in ('trialing', 'active') and s.expires_at > now() then s.status::text$$,
    $$greatest(0, ceil(extract(epoch from (s.expires_at - now())) / 86400.0))::integer as b_days,$$,
    $$b.b_starts, b.b_expires, b.b_days, b.b_provider,$$
  ],
  array[1, 1, 1, 1], true);
revoke all on function public.list_platform_subscriptions(text, text, text, text, integer, text, integer, integer) from public, anon;
grant execute on function public.list_platform_subscriptions(text, text, text, text, integer, text, integer, integer) to authenticated;

-- ---- esquema
drop function if exists public.platform_begin_operation(uuid, text, uuid);
drop function if exists public.platform_finish_operation(uuid, jsonb);
drop function if exists public.subscription_access_active(public.subscription_status, timestamptz, boolean);
drop table if exists public.platform_operation_keys;

alter table public.subscriptions drop constraint if exists subscriptions_lifetime_coherent;
alter table public.subscriptions alter column expires_at set not null;
alter table public.subscriptions drop column if exists lifetime;
alter table public.company_entitlements drop constraint if exists company_entitlements_lifetime_coherent;
alter table public.company_entitlements drop column if exists lifetime;

delete from public.plans p where p.lifetime and not exists (select 1 from public.subscriptions s where s.plan_id = p.id)
  and not exists (select 1 from public.subscription_payments sp where sp.plan_id = p.id);
alter table public.plans drop constraint if exists plans_lifetime_has_no_duration;
alter table public.plans drop constraint if exists plans_access_duration_required_unless_custom;
alter table public.plans add constraint plans_access_duration_required_unless_custom
  check (code = 'CUSTOM' or access_duration_days is not null);
alter table public.plans drop column if exists lifetime;

commit;
`;
out("20261012000000_lifetime_access_and_license_ops.down.sql", down);
console.log("ok");
