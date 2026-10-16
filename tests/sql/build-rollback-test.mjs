/**
 * Monta (a partir dos arquivos REAIS) a prova de rollback + replay das migrations 20261011*, para rodar no TEST:
 *
 *   node tests/sql/build-rollback-test.mjs <digest-de-Production> > rollback-proof.sql
 *
 * A saída é uma transação que: (1) tira um snapshot do ACL (tabelas, colunas, funções, privilégios padrão),
 * (2) aplica os scripts supabase/rollback/*.down.sql, (3) tira outro snapshot, (4) reaplica as migrations e tira o terceiro,
 * (5) termina em erro proposital `RESULT:` com os três digests (nada persiste).
 * Critério: digest(S2) == digest(S0) (replay idempotente) e digest(S1) == <digest-de-Production> (rollback exato).
 * O digest de Production vem da MESMA consulta de snapshot (função pg_temp.acl_snap) rodada em Production, somente leitura,
 * ENQUANTO Production ainda não tiver as migrations (depois delas, a referência passa a ser o estado pós-migration).
 * Evidência de 2026-10-09: Production = c2c9718c4974c4d19a4dddbfba6a93a3 (877 entradas) == TEST após o rollback.
 */
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const body = (sql) => sql.replace(/^\s*(begin|commit);\s*$/gim, "");
const expected = process.argv[2] ?? "<digest-de-Production>";

const snapFn = String.raw`create function pg_temp.acl_snap() returns table (n bigint, digest text, rel_n bigint, col_n bigint, fn_n bigint, def_n bigint) language sql as $f$
with rows as (
  select 'rel:' || c.relname || ':' || pg_get_userbyid(a.grantee) || ':' || a.privilege_type as x
    from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault((case when c.relkind='S' then 's' else 'r' end)::"char", c.relowner))) a
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f','S')
     and a.grantee <> 0 and pg_get_userbyid(a.grantee) in ('anon','authenticated')
  union all
  select 'col:' || c.relname || '.' || at.attname || ':' || pg_get_userbyid(a.grantee) || ':' || a.privilege_type
    from pg_attribute at join pg_class c on c.oid = at.attrelid cross join lateral aclexplode(at.attacl) a
   where c.relnamespace = 'public'::regnamespace and at.attacl is not null
  union all
  select 'fn:' || p.oid::regprocedure::text || ':' || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ':' || a.privilege_type
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
   where p.pronamespace = 'public'::regnamespace and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon','authenticated'))
  union all
  select 'def:' || pg_get_userbyid(d.defaclrole) || ':' || d.defaclnamespace::regnamespace::text || ':' || d.defaclobjtype::text || ':' || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ':' || a.privilege_type
    from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
   where d.defaclnamespace = 'public'::regnamespace and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon','authenticated'))
)
select count(*), md5(string_agg(x, E'\n' order by x)),
       count(*) filter (where x like 'rel:%'), count(*) filter (where x like 'col:%'),
       count(*) filter (where x like 'fn:%'), count(*) filter (where x like 'def:%')
  from rows
$f$;`;

const out = `-- GERADO por tests/sql/build-rollback-test.mjs — não editar à mão. Só TEST. Esperado em Production: ${expected}
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
${snapFn}
create temp table snap (label text, n bigint, digest text, rel_n bigint, col_n bigint, fn_n bigint, def_n bigint);
insert into snap select 'S0_estado_atual', * from pg_temp.acl_snap();
-- ROLLBACK
${body(read("supabase/rollback/20261011000100_privilege_minimization.down.sql"))}
${body(read("supabase/rollback/20261011000000_billing_hardening.down.sql"))}
insert into snap select 'S1_apos_rollback (esperado ${expected})', * from pg_temp.acl_snap();
-- REPLAY das migrations
${read("supabase/migrations/20261011000100_privilege_minimization.sql")}
${read("supabase/migrations/20261011000000_billing_hardening.sql")}
insert into snap select 'S2_apos_replay (esperado == S0)', * from pg_temp.acl_snap();
do $result$ declare v text; begin select string_agg(label || ' => n=' || n || ' digest=' || digest || ' rel=' || rel_n || ' col=' || col_n || ' fn=' || fn_n || ' def=' || def_n, E'\\n' order by label) into v from snap; raise exception E'RESULT:\\n%', v; end $result$;
`;
process.stdout.write(out);
