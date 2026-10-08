# admin

Painel administrativo da PLATAFORMA (equipe interna do Prime Ges — não
confundir com "owner" de uma empresa cliente), isolado da área pública e da
área do cliente.

Importante: esta pasta usa o segmento real `/admin` (não um route group entre
parênteses) porque o guard de acesso em `src/middleware.ts`
(`ADMIN_PREFIX = "/admin"`) intercepta pelo path literal da URL. Um route group
como `(admin)` não geraria esse segmento e ficaria fora do alcance do guard.

## Acesso (Clerk, sem login próprio)

1. Sem sessão → o middleware envia para `/login?next=/admin` (Clerk) e o Clerk
   devolve para `/admin` depois do login. Não existe `/admin/login`.
2. Com sessão → o middleware confere `profiles.role` (`admin`/`super_admin`);
   quem não é admin vai para `/app`.
3. `layout.tsx` repete a checagem no servidor com `requirePlatformAdmin()`
   (`src/lib/admin/queries.ts`), que chama `is_platform_admin()` no banco
   (role `admin|super_admin` **e** status `active`). Nunca `company_members.role`.
4. Todo dado cross-empresa vem de RPCs `SECURITY DEFINER` que exigem
   `is_platform_admin()`; RLS das tabelas de negócio continua fechada.

## Hierarquia SUPER_ADMIN > ADMIN > USER

A autoridade é o banco (RPCs `SECURITY DEFINER` que revalidam ator, alvo e
hierarquia e gravam auditoria); a UI só esconde o que o papel não pode usar.
Regras espelhadas em `src/lib/admin/permissions.ts`.

| Operação | USER | ADMIN | SUPER_ADMIN |
|---|:-:|:-:|:-:|
| Acessar `/admin`, ver usuários, empresas, planos | ❌ | ✅ | ✅ |
| Suspender/reativar usuário comum | ❌ | ✅ | ✅ |
| Suspender/reativar admin ou super_admin | ❌ | ❌ | ✅ |
| Alterar papel (promover/rebaixar) | ❌ | ❌ | ✅ |
| Alterar status de empresa | ❌ | ❌ | ✅ |
| `/admin/administrators`, `/admin/settings` | ❌ | ❌ | ✅ |
| Auditoria | ❌ | só as próprias | tudo |

Ninguém altera o próprio papel/status, e a plataforma sempre mantém ao menos um
super_admin ativo. `admin` e `super_admin` suspensos/inativos perdem o acesso em
todas as camadas (middleware, layout, RPCs, RLS).

## Estado

| Rota | Estado |
|---|---|
| `/admin` | Dashboard com métricas de fonte confiável (`get_platform_admin_overview`) |
| `/admin/users` | Lista paginada com busca e filtros (`list_platform_admin_users`) |
| `/admin/companies` | Lista paginada com busca e filtros (`list_platform_admin_companies`) |
| `/admin/plans` | Catálogo de planos, somente leitura (`getPlans({ includeInactive })`) |
| `/admin/administrators` | Lista de administradores — **super_admin only** (`list_platform_administrators`) |
| `/admin/subscriptions`, `/payments`, `/audit`, `/settings` | Placeholders "em breve" (`/settings` é super_admin only) |

Já com escrita auditada: suspender/reativar usuário e alterar papel (`/admin/users`).
Pendente: conceder dias, trocar plano, pagamento manual, CRUD de planos, ações em
empresas, auditoria visível, usuários online. Toda ação nova deve gravar auditoria
via `write_platform_audit_log()` dentro de uma RPC `SECURITY DEFINER`.
