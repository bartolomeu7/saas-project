/**
 * Monta, A PARTIR DOS ARQUIVOS REAIS, a prova de rollback + replay + compatibilidade de versões da Missão 09
 * (migrations 20261014000000, ...000100, ...000200, ...000300 e seus `down`):
 *
 *   node tests/sql/build-mission09-proof.mjs > mission09-proof.sql        (rodar SOMENTE no projeto TEST)
 *
 * A saída é UMA transação que termina em erro proposital `RESULT:` (nada persiste):
 *   S0  fingerprint do estado atual (as 4 migrations aplicadas)
 *   --  down na ordem inversa: 000300 -> 000200 -> 000100 -> 000000
 *   S1  fingerprint após o rollback => deve ser IGUAL ao de antes da missão (referência abaixo)
 *   --  ESTADO ANTIGO: verificações de compatibilidade (o comportamento original)
 *   --  up 000000 (EXPANSÃO 1) + verificações: código ANTIGO e NOVO funcionam
 *   --  up 000100 (EXPANSÃO 2) + verificações
 *   --  up 000200 (CONTRAÇÃO)  + verificações
 *   --  up 000300 (acesso aos dados) + verificação
 *   S2  fingerprint após o replay => deve ser IGUAL a S0
 *
 * Referência pré-missão (TEST em 2026-10-13/14, == tests/sql/build-full-rollback-proof.mjs, "alvo após as 5 migrations"):
 *   acl=317 86bdbab0…  column=577 a8d8b0e0…  constraint=317 b6dd9bbd…  fn_body=131 051c9762…  fn_cfg=131 b329f0b6…
 *   index=237 f6146d2e…  policy=88 a646566a…  rel=53 a3463f50…  trigger=70 8d925b6c…
 *
 * Execução de 2026-10-14: os mesmos arquivos foram carregados numa tabela de rascunho do TEST (conferidos por MD5 contra
 * estes arquivos) e executados por este mesmo roteiro; resultado em docs/qa/mission-09-closure.md.
 */
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const strip = (sql) =>
  sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l) && l.trim() !== "" && !/^\s*(begin|commit);\s*$/i.test(l))
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n");

const fpSelect = read("tests/sql/catalog-fingerprint.sql")
  .split("\n")
  .filter((l) => !/^\s*--/.test(l))
  .join("\n")
  .replace(/;\s*$/, "");
const tail = /select k, count\(\*\) n, md5\(string_agg\(x, E'\\n' order by x collate "C"\)\) digest from items group by k order by k$/;
if (!tail.test(fpSelect)) throw new Error("fingerprint: final da consulta inesperado");
const fp = (label) => `insert into snap ${fpSelect.replace(tail, `select '${label}', k, count(*), md5(string_agg(x, E'\\n' order by x collate "C")) from items group by k`)};`;

const M = "supabase/migrations/";
const R = "supabase/rollback/";
const ups = [
  M + "20261014000000_plans_management_and_usage_limits.sql",
  M + "20261014000100_session_gate_and_trial_hardening.sql",
  M + "20261014000200_trial_requires_authorization.sql",
  M + "20261014000300_data_layer_access_gate.sql",
].map((f) => strip(read(f)));
const downs = [
  R + "20261014000300_data_layer_access_gate.down.sql",
  R + "20261014000200_trial_requires_authorization.down.sql",
  R + "20261014000100_session_gate_and_trial_hardening.down.sql",
  R + "20261014000000_plans_management_and_usage_limits.down.sql",
].map((f) => strip(read(f)));

const helpers = `
create temp table cc (n serial, state text, label text, expect text, got text, ok boolean);
create or replace function pg_temp.cchk(st text, l text, q text, e text) returns void language plpgsql as $$
declare v text; got text; pass boolean;
begin
  begin execute q into v; got := 'OK=' || coalesce(v, 'null');
  exception when others then got := 'ERR=' || sqlerrm; end;
  pass := case when e like 'OK=%' then got = e when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0 else false end;
  insert into cc(state, label, expect, got, ok) values (st, l, e, left(got, 200), pass);
end $$;
create or replace function pg_temp.as_user(p_sub text, q text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin execute q into v; exception when others then v := 'ERR=' || sqlerrm; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  return v;
end $$;
create or replace function pg_temp.u(i integer) returns uuid language sql as $$ select ('cccccccc-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid $$;
create or replace function pg_temp.consumed(i integer) returns bigint language sql volatile as $$ select count(*) from public.trial_signup_events where user_id = pg_temp.u($1) and consumed_at is not null $$;
create or replace function pg_temp.sub_of(i integer) returns text language sql as $$
  select coalesce((select s.status::text || ',' || (s.trial_claimed_by = pg_temp.u(i))::text from public.subscriptions s
                    join public.company_members m on m.company_id = s.company_id where m.user_id = pg_temp.u(i) and m.role = 'owner'), 'sem_assinatura') $$;
create or replace function pg_temp.fnexists(sig text) returns text language sql as $$ select (to_regprocedure($1) is not null)::text $$;
create or replace function pg_temp.outcols(fn text) returns text language sql as $$
  select count(*)::text from information_schema.parameters where specific_schema = 'public' and specific_name like $1 || '\\_%' and parameter_mode = 'OUT' $$;
insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status)
select pg_temp.u(g), 'cc_u' || g, 'CC ' || g, 'cc-u' || g || '@example.invalid', 'user', 'active' from generate_series(1, 12) g;`;

const sections = [
  { title: "ESTADO ANTIGO", before: null, checks: `
select pg_temp.cchk('antigo', 'funções novas não existem', $q$select pg_temp.fnexists('public.session_slot_status(text)') || ',' || pg_temp.fnexists('public.authorize_trial_signup(uuid,text)') || ',' || pg_temp.fnexists('public.claim_free_trial()')$q$, 'OK=false,false,false');
select pg_temp.cchk('antigo', 'get_public_plans tem o formato antigo (14 colunas)', $q$select pg_temp.outcols('get_public_plans')$q$, 'OK=14');
select pg_temp.cchk('antigo', 'cadastro novo recebe o teste (comportamento original)', $q$select pg_temp.as_user('cc_u1', $x$select (public.create_company_with_owner('[CC] antigo', 'other')).name$x$) || ',' || pg_temp.sub_of(1)$q$, 'OK=[CC] antigo,trialing,true');` },
  { title: "EXPANSÃO 1", up: 0, checks: `
select pg_temp.cchk('expansao1', 'funções do gate e do antifraude passam a existir', $q$select pg_temp.fnexists('public.session_slot_status(text)') || ',' || pg_temp.fnexists('public.authorize_trial_signup(uuid,text)') || ',' || pg_temp.fnexists('public.claim_free_trial()')$q$, 'OK=true,true,false');
select pg_temp.cchk('expansao1', 'get_public_plans: superconjunto do formato antigo (26 colunas; as 14 antigas presentes)', $q$select pg_temp.outcols('get_public_plans') || ',' || (select count(*) from information_schema.parameters where specific_schema = 'public' and specific_name like 'get\\_public\\_plans\\_%' and parameter_mode = 'OUT' and parameter_name in ('id','code','name','description','price','currency','access_duration_days','additional_user_limit','trial','support_enabled','tickets_enabled','exclusive_groups_enabled','early_access_enabled','status'))$q$, 'OK=26,14');
select pg_temp.cchk('expansao1', 'CÓDIGO ANTIGO: cadastro novo continua recebendo o teste', $q$select pg_temp.as_user('cc_u2', $x$select (public.create_company_with_owner('[CC] exp1 antigo', 'other')).name$x$) || ',' || pg_temp.sub_of(2)$q$, 'OK=[CC] exp1 antigo,trialing,true');
select pg_temp.cchk('expansao1', 'CÓDIGO NOVO: autoriza e cria a empresa — recebe o teste uma vez', $q$select (public.authorize_trial_signup(pg_temp.u(3), repeat('a', 64)) ->> 'allowed') || ',' || pg_temp.as_user('cc_u3', $x$select (public.create_company_with_owner('[CC] exp1 novo', 'other')).name$x$) || ',' || pg_temp.sub_of(3)$q$, 'OK=true,[CC] exp1 novo,trialing,true');
select pg_temp.cchk('expansao1', 'registro de sessão com 3 argumentos funciona', $q$select public.register_session_slot(pg_temp.u(4), 'cc_s1', array['cc_s1']) ->> 'state'$q$, 'OK=allowed');
select pg_temp.cchk('expansao1', 'checkout recusa plano de teste (preço 0)', $q$select * from public.claim_subscription_payment((select id from public.companies where name = '[CC] exp1 antigo'), (select id from public.plans where code = 'FREE_TRIAL'), 0)$q$, 'ERR=Plano sem preço ou duração fixa');` },
  { title: "EXPANSÃO 2", up: 1, checks: `
select pg_temp.cchk('expansao2', 'registro de sessão: 3 e 4 argumentos coexistem', $q$select (public.register_session_slot(pg_temp.u(4), 'cc_s2', array['cc_s1','cc_s2']) ->> 'state') || ',' || (public.register_session_slot(pg_temp.u(4), 'cc_s3', array['cc_s1','cc_s2','cc_s3'], true) ->> 'state')$q$, 'OK=allowed,allowed');
select pg_temp.cchk('expansao2', 'CÓDIGO ANTIGO ainda recebe o teste (contração não aplicada)', $q$select pg_temp.as_user('cc_u5', $x$select (public.create_company_with_owner('[CC] exp2 antigo', 'other')).name$x$) || ',' || pg_temp.sub_of(5)$q$, 'OK=[CC] exp2 antigo,trialing,true');
insert into public.companies (id, name, business_type, status) values ('cccccccc-1111-0000-0000-000000000006', '[CC] sem teste', 'other', 'active');
insert into public.company_members (company_id, user_id, role) values ('cccccccc-1111-0000-0000-000000000006', pg_temp.u(6), 'owner');
select pg_temp.cchk('expansao2', 'claim_free_trial sem autorização: nada', $q$select pg_temp.as_user('cc_u6', $x$select public.claim_free_trial() ->> 'reason'$x$)$q$, 'OK=not_authorized');
select pg_temp.cchk('expansao2', 'autorizado, o pedido de teste concede uma vez', $q$select (public.authorize_trial_signup(pg_temp.u(6), repeat('b', 64)) ->> 'allowed') || ',' || pg_temp.as_user('cc_u6', $x$select public.claim_free_trial() ->> 'reason'$x$) || ',' || pg_temp.sub_of(6)$q$, 'OK=true,ok,trialing,true');` },
  { title: "CONTRAÇÃO", up: 2, checks: `
select pg_temp.cchk('contraido', 'cadastro SEM autorização: empresa criada, sem teste', $q$select pg_temp.as_user('cc_u7', $x$select (public.create_company_with_owner('[CC] contraido sem', 'other')).name$x$) || ',' || pg_temp.sub_of(7)$q$, 'OK=[CC] contraido sem,sem_assinatura');
select pg_temp.cchk('contraido', 'cadastro COM autorização: recebe o teste e consome a autorização', $q$select (public.authorize_trial_signup(pg_temp.u(8), repeat('c', 64)) ->> 'allowed') || ',' || pg_temp.as_user('cc_u8', $x$select (public.create_company_with_owner('[CC] contraido com', 'other')).name$x$) || ',' || pg_temp.sub_of(8) || ',' || pg_temp.consumed(8)$q$, 'OK=true,[CC] contraido com,trialing,true,1');
select pg_temp.cchk('contraido', 'quem ficou sem teste pode pedir depois (mesma regra)', $q$select (public.authorize_trial_signup(pg_temp.u(7), repeat('d', 64)) ->> 'allowed') || ',' || pg_temp.as_user('cc_u7', $x$select public.claim_free_trial() ->> 'reason'$x$) || ',' || pg_temp.sub_of(7)$q$, 'OK=true,ok,trialing,true');` },
  { title: "ACESSO AOS DADOS", up: 3, checks: `
select pg_temp.cchk('acesso', 'empresa com teste ativo grava', $q$select pg_temp.as_user('cc_u7', $x$insert into public.customers(company_id, name) select company_id, 'x' from public.company_members where user_id = (select pg_temp.u(7)) returning 'ok'$x$)$q$, 'OK=ok');` },
];

const parts = [
  "-- GERADO por tests/sql/build-mission09-proof.mjs — não editar à mão. Só TEST.",
  "begin;",
  `select set_config('request.jwt.claims', '{"role":"service_role"}', true);`,
  "create temp table snap (label text, k text, n bigint, digest text);",
  helpers,
  fp("S0_estado_atual"),
  ...downs,
  fp("S1_apos_rollback"),
];
for (const s of sections) {
  if (s.up !== undefined) parts.push(ups[s.up]);
  parts.push(s.checks);
}
parts.push(
  fp("S2_apos_replay"),
  `do $result$ declare r text; c text; begin
  select string_agg(label || ' ' || k || ' n=' || n || ' ' || digest, E'\\n' order by k, label) into r from snap;
  select string_agg(state || ' | ' || case when ok then 'OK ' else 'FALHA ' end || label || ' => ' || got, E'\\n' order by n) into c from cc;
  raise exception E'RESULT:\\n%\\n---COMPAT---\\n%', r, c;
end $result$;`
);
process.stdout.write(parts.join("\n") + "\n");
