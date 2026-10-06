# Autenticação — Prime Ges

## Arquitetura

```
Clerk (login, cadastro, sessão, recuperação de senha, logout)
  → JWT de sessão do Clerk
  → Supabase Third-Party Auth (valida o JWT via JWKS do Clerk)
  → auth.jwt()->>'sub'  (id do usuário no Clerk)
  → public.profiles.clerk_user_id
  → public.profiles.user_id  (UUID interno, identidade usada em todo o banco)
  → RLS (88 policies) e RPCs
```

- **Clerk** é a única autenticação. O Supabase é só banco, RLS e RPCs; o app
  não usa mais Supabase Auth (sem `signIn`/`signUp`/`signOut`/`getUser`).
- O `user_id` interno é um UUID próprio de `public.profiles`, sem FK para
  `auth.users`. Todas as colunas de autoria (`created_by`, `actor_user_id`,
  `company_members.user_id` etc.) referenciam `profiles(user_id)`.
- Não há Clerk Organizations: empresas e papéis continuam em
  `companies` / `company_members` (owner, admin, employee) e a role de
  plataforma em `profiles.role` (user, admin, super_admin).

## Peças no banco

| Objeto | Função |
|---|---|
| `profiles.clerk_user_id` (text, único) | Liga o usuário Clerk ao profile |
| `public.current_profile_user_id()` | `SECURITY DEFINER`, devolve o `user_id` interno do JWT atual (ou NULL). Substitui `auth.uid()` em todas as policies e RPCs |
| `public.ensure_profile(nome, email)` | Cria/recupera o profile do usuário Clerk logado (idempotente). A identidade vem só do JWT, nunca de parâmetro |

## Peças no app

| Arquivo | Papel |
|---|---|
| `src/middleware.ts` | `clerkMiddleware`: rotas protegidas, guard de `/admin` (profiles.role) e guard de assinatura, ambos lendo o banco com o token do Clerk |
| `src/lib/supabase/clerk-client.ts` | Client Supabase autenticado pelo token do Clerk |
| `src/lib/supabase/server.ts` | `createSessionClient()` — usado por todos os módulos de dados |
| `src/lib/auth/clerk-session.ts` | Resolve o UUID interno (lazy creation via `ensure_profile`) |
| `src/lib/auth/session.ts` | `getCurrentUser()` / `getCurrentProfile()` |
| `src/app/(public)/login`, `register` | Componentes `<SignIn/>` / `<SignUp/>` do Clerk |

## Variáveis de ambiente

`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` e `CLERK_SECRET_KEY` são obrigatórias.
Development usa `pk_test_`/`sk_test_`; Production usa `pk_live_`/`sk_live_`.
Nunca misturar. No Supabase de cada ambiente, **Authentication → Third-Party
Auth → Clerk** precisa apontar para o domínio da instância Clerk daquele ambiente.

## Histórico de migrations

`supabase/migrations/20261006000000_clerk_a_to_e_identity_bridge.sql`
(coluna, funções, FKs, RLS), `…0001_clerk_f_rpc_cutover.sql` (38 funções
`auth.uid()` → `current_profile_user_id()`), `…0002_clerk_h_drop_legacy_auth_trigger.sql`
(remove o trigger legado `on_auth_user_created`).

## Proteção de campos do profile

`profiles.role`, `status` e `user_id` não podem ser alterados pelo próprio
usuário (trigger `protect_profile_restricted_fields`); só o `service_role`
(painel administrativo) altera.
