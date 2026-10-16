-- =============================================================================
-- Impressão digital do catálogo `public` (somente leitura). Roda IGUAL em Production e no TEST.
-- Uma linha por tipo: k = tipo, n = nº de itens, digest = md5 dos itens ordenados (collate "C").
--   fn_body    corpo das funções (sem comentários e sem espaços: ignora só formatação)
--   fn_cfg     SECURITY DEFINER, search_path, tipo de retorno, volatilidade
--   policy / trigger / constraint / index / column / rel (RLS ligada?)
--   acl        privilégios de anon/authenticated em tabelas, colunas, funções e privilégios padrão
-- Uso: comparar Production (antes das migrations) com o TEST após os `down` (tests/sql/build-full-rollback-proof.mjs).
-- Não revele nada além dos digests: não contém dados de negócio.
-- =============================================================================
with items as (
 select 'fn_body' k, p.oid::regprocedure::text || '|' || substr(md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 1, 10) x
   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
 union all
 select 'fn_cfg', p.oid::regprocedure::text || '|' || p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '') || '|' || p.prorettype::regtype::text || '|' || p.proretset::text || '|' || p.provolatile::text
   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
 union all
 select 'policy', tablename || '.' || policyname || '|' || substr(md5(cmd || coalesce(array_to_string(roles, ','), '') || coalesce(qual, '') || coalesce(with_check, '') || permissive), 1, 8) from pg_policies where schemaname = 'public'
 union all
 select 'trigger', c.relname || '.' || t.tgname || '|' || substr(md5(regexp_replace(pg_get_triggerdef(t.oid), '\s+', ' ', 'g')), 1, 8) from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
 union all
 select 'constraint', c.relname || '.' || k.conname || '|' || substr(md5(pg_get_constraintdef(k.oid)), 1, 8) from pg_constraint k join pg_class c on c.oid = k.conrelid where c.relnamespace = 'public'::regnamespace
 union all
 select 'index', tablename || '.' || indexname || '|' || substr(md5(indexdef), 1, 8) from pg_indexes where schemaname = 'public'
 union all
 select 'column', table_name || '.' || column_name || '|' || substr(md5(data_type || is_nullable || coalesce(column_default, '')), 1, 8) from information_schema.columns where table_schema = 'public'
 union all
 select 'rel', c.relname || '|' || c.relkind::text || c.relrowsecurity::text || c.relforcerowsecurity::text from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
 union all
 select 'acl', 'rel:' || c.relname || ':' || pg_get_userbyid(a.grantee) || ':' || a.privilege_type
   from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault((case when c.relkind = 'S' then 's' else 'r' end)::"char", c.relowner))) a
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S') and a.grantee <> 0 and pg_get_userbyid(a.grantee) in ('anon', 'authenticated')
 union all
 select 'acl', 'col:' || c.relname || '.' || at.attname || ':' || pg_get_userbyid(a.grantee) || ':' || a.privilege_type
   from pg_attribute at join pg_class c on c.oid = at.attrelid cross join lateral aclexplode(at.attacl) a
  where c.relnamespace = 'public'::regnamespace and at.attacl is not null
 union all
 select 'acl', 'fn:' || p.oid::regprocedure::text || ':' || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ':' || a.privilege_type
   from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
  where p.pronamespace = 'public'::regnamespace and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated'))
 union all
 select 'acl', 'def:' || pg_get_userbyid(d.defaclrole) || ':' || d.defaclnamespace::regnamespace::text || ':' || d.defaclobjtype::text || ':' || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ':' || a.privilege_type
   from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
  where d.defaclnamespace = 'public'::regnamespace and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated'))
)
select k, count(*) n, md5(string_agg(x, E'\n' order by x collate "C")) digest from items group by k order by k;
