# admin

Painel administrativo da PLATAFORMA (equipe interna do Prime Ges — não
confundir com "owner" de uma empresa cliente), isolado da área pública e da
área do cliente. Guia completo (RPCs, permissões, auditoria, testes,
procedimento de promoção): [`docs/admin-platform.md`](../../../docs/admin-platform.md).

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
| Acessar `/admin`; ver painel, usuários, empresas, assinaturas, pagamentos, planos | ❌ | ✅ | ✅ |
| Suspender/reativar usuário comum; editar nome de usuário comum | ❌ | ✅ | ✅ |
| Conceder dias (até o limite configurável), liberar 30 dias | ❌ | ✅ | ✅ (até 365) |
| Registrar pagamento manual, trocar plano, reativar assinatura | ❌ | ✅ | ✅ |
| Editar nome/tipo da empresa, sincronizar entitlements, ferramentas | ❌ | ✅ | ✅ |
| Reverificar pagamento na EvoPay | ❌ | ✅ | ✅ |
| Suspender/reativar admin ou super_admin; alterar papéis | ❌ | ❌ | ✅ |
| Cancelar assinatura, ajustar vencimento, anular pagamento manual | ❌ | ❌ | ✅ |
| Criar/editar/ativar/desativar planos; ativar/inativar empresas | ❌ | ❌ | ✅ |
| `/admin/administrators`, `/admin/settings` | ❌ | ❌ | ✅ |
| Auditoria | ❌ | só as próprias ações | tudo |

Ninguém altera o próprio papel/status, e a plataforma sempre mantém ao menos um
super_admin ativo (inclusive sob concorrência). `admin` e `super_admin`
suspensos/inativos perdem o acesso em todas as camadas (middleware, layout, RPCs, RLS).

## Rotas

| Rota | O que faz |
|---|---|
| `/admin` | Dashboard: usuários, presença, empresas, assinaturas, receita (EvoPay + manual), séries de 30 dias, atenção, webhooks, atividade |
| `/admin/users`, `/admin/users/[id]` | Lista (busca, plano, assinatura, presença, ordenação) e detalhe com ações |
| `/admin/companies`, `/admin/companies/[id]` | Lista e detalhe: edição, status, uso agregado, equipe, acesso/cobrança |
| `/admin/subscriptions` | Assinaturas com estado calculado (mesma regra do guard do produto) |
| `/admin/payments`, `/admin/payments/[id]` | Pagamentos EvoPay + manuais, resumo, reverificar, anular manual |
| `/admin/plans` | Catálogo e CRUD (nunca exclui; só desativa) |
| `/admin/audit` | Central de auditoria por categoria |
| `/admin/tools` | Busca global, diagnósticos, ações rápidas seguras, checagem do ambiente |
| `/admin/integrations` | EvoPay (webhook), Clerk e Supabase |
| `/admin/administrators` | Super admin: promover por e-mail (perfil existente), papéis, status |
| `/admin/settings` | Super admin: parâmetros reais da plataforma |

Toda ação nova deve gravar auditoria via `write_platform_audit_log()` dentro de
uma RPC `SECURITY DEFINER` e ter teste em `tests/sql/admin_platform.sql`.
