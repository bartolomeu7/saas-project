/**
 * Monta, A PARTIR DOS ARQUIVOS REAIS, a prova completa de rollback + replay das 5 migrations (20261011... e 20261012...):
 *
 *   node tests/sql/build-full-rollback-proof.mjs > full-rollback-proof.sql     (rodar SOMENTE no projeto TEST)
 *
 * A saída é UMA transação que termina em erro proposital `RESULT:` (nada persiste):
 *   S0  fingerprint do estado atual
 *   --  cinco scripts `down` em ordem inversa (000200 -> 000100 -> 000000 -> 20261011000100 -> 20261011000000)
 *   S1  fingerprint após o rollback  => deve ser IGUAL ao de Production ANTES das migrations (referência abaixo)
 *   --  as cinco migrations reais, em ordem
 *   S2  fingerprint após o replay    => deve ser IGUAL a S0
 *
 * Referência de Production (somente leitura, 2026-10-13, 71 migrations, última 20261008202401), consulta tests/sql/catalog-fingerprint.sql:
 *   acl=877 c2c9718c4974c4d19a4dddbfba6a93a3          column=568 3aa8b7a108e312fb7650f20aaeab203b
 *   constraint=312 e731c1bb913475b3655d61b74e8738a6   fn_body=120 c05339e59e16369f4405ff6ec881419a
 *   fn_cfg=120 7ac207890ee80d07c8f3db64f9205a74       index=234 e35319de1464b22e969920f01842e07f
 *   policy=88 a646566a86e9fe32b532a59039f38910        rel=52 d4b3eb6b763eb5139a98f96f415a3554
 *   trigger=70 8d925b6c7f00631f76039e5f61c01b9b
 * Alvo esperado em Production APÓS as 5 migrations (== TEST em 2026-10-13, fonte de verdade = o catálogo, não os dados):
 *   acl=317 86bdbab03b28f97ffd85a5e939b9582f          column=577 a8d8b0e0d2b1e4804dd21700f19749a3
 *   constraint=317 b6dd9bbd654eb2f3c161f7aa813b6cf9   fn_body=131 051c97623135aa074eee5babfde15535
 *   fn_cfg=131 b329f0b659c731485dc9382bcb2b0982       index=237 f6146d2ed4d074de8aaed44581da70e6
 *   policy=88 a646566a86e9fe32b532a59039f38910        rel=53 a3463f500bce31f84e2b1d5753da37e0
 *   trigger=70 8d925b6c7f00631f76039e5f61c01b9b
 * (digests de Production mudam se QUALQUER objeto do schema public mudar: reconsulte antes de comparar.)
 *
 * Nota: a saída tem ~165 KB; o limite de tamanho de uma única chamada do MCP do Supabase pode exigir rodar pelo editor SQL
 * do painel. Em 2026-10-13 a prova foi executada em duas partes equivalentes (rollback numa transação; replay a partir de
 * uma tabela de rascunho com os MESMOS scripts, conferidos por MD5 contra estes arquivos). Resultado: docs/qa/mission-08-1-pre-golive-closure.md.
 */
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// Remove só comentários de LINHA INTEIRA, linhas em branco, begin/commit e espaço à direita (nunca mexe no meio do código).
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

const downs = [
  "supabase/rollback/20261012000200_admin_company_members_and_reconciliation.down.sql",
  "supabase/rollback/20261012000100_plans_lifetime_awareness.down.sql",
  "supabase/rollback/20261012000000_lifetime_access_and_license_ops.down.sql",
  "supabase/rollback/20261011000100_privilege_minimization.down.sql",
  "supabase/rollback/20261011000000_billing_hardening.down.sql",
];
const ups = [
  "supabase/migrations/20261011000000_billing_hardening.sql",
  "supabase/migrations/20261011000100_privilege_minimization.sql",
  "supabase/migrations/20261012000000_lifetime_access_and_license_ops.sql",
  "supabase/migrations/20261012000100_plans_lifetime_awareness.sql",
  "supabase/migrations/20261012000200_admin_company_members_and_reconciliation.sql",
];

const parts = [
  "-- GERADO por tests/sql/build-full-rollback-proof.mjs — não editar à mão. Só TEST.",
  "begin;",
  `select set_config('request.jwt.claims', '{"role":"service_role"}', true);`,
  "create temp table snap (label text, k text, n bigint, digest text);",
  fp("S0_estado_atual"),
  ...downs.map((d) => strip(read(d))),
  fp("S1_apos_rollback"),
  ...ups.map((u) => strip(read(u))),
  fp("S2_apos_replay"),
  `do $result$ declare v text; begin select string_agg(label || ' ' || k || ' n=' || n || ' ' || digest, E'\\n' order by k, label) into v from snap; raise exception E'RESULT:\\n%', v; end $result$;`,
];
process.stdout.write(parts.join("\n") + "\n");
