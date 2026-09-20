# admin

Painel administrativo da PLATAFORMA (equipe interna do Prime Ges — não
confundir com "owner" de uma empresa cliente), isolado da área pública e
da área do cliente.

Importante: esta pasta usa o segmento real `/admin` (não um route group
entre parênteses) porque o guard de acesso em `src/middleware.ts`
(`ADMIN_PREFIX = "/admin"`) intercepta pelo path literal da URL. Um route
group como `(admin)` não geraria esse segmento e ficaria fora do alcance
do guard — qualquer página colocada ali não seria protegida.

Acesso: `profiles.role` igual a `admin` ou `super_admin` (nunca
`company_members.role` — ver `src/lib/admin/guard.ts`). O guard já está
implementado no middleware; falta só o conteúdo real do painel (dashboard,
empresas, usuários, planos, assinaturas, tickets, auditoria — ver
`docs/architecture.md`).

Ainda vazio — sem página nenhuma implementada ainda.
