# Autenticação — Prime Ges

Este documento descreve o funcionamento do sistema de autenticação implementado
na Etapa 2. Cobre apenas autenticação e perfil de usuário — não cobre
pagamentos, planos ou o painel administrativo.

## Visão geral

- Autenticação via **Supabase Auth** (e-mail + senha).
- Nenhuma senha ou credencial é armazenada em tabelas próprias — apenas em
  `auth.users`, gerenciado pelo Supabase.
- Todo fluxo de auth roda como **Server Action** (`src/lib/auth/actions.ts`),
  nunca diretamente no client — a chave `anon` nunca é usada para operações
  sensíveis fora do contexto server, e a chave `service_role` não é usada em
  nenhum fluxo de auth (não é necessária).

## Perfil de usuário (`public.profiles`)

Toda vez que um usuário é criado em `auth.users` (cadastro), um trigger no
banco (`on_auth_user_created`, ver `supabase/migrations/001_create_profiles.sql`)
cria automaticamente a linha correspondente em `public.profiles`, com:

- `role = 'user'`
- `status = 'active'`
- `full_name` e `email` copiados dos metadados do cadastro, quando disponíveis

Essa lógica existe **apenas no banco** — o frontend não precisa (e não deve)
criar profiles manualmente.

### Campos protegidos

`user_id`, `role` e `status` não podem ser alterados pelo próprio usuário.
Isso é garantido em duas camadas:

1. **RLS** — a policy de update só permite que o usuário altere a própria
   linha (`user_id = auth.uid()`), mas não restringe colunas por si só.
2. **Trigger** `protect_profile_restricted_fields` — roda antes de qualquer
   `UPDATE` em `profiles` e rejeita a alteração de `user_id`, `role` ou
   `status`, a menos que a operação venha de uma sessão `service_role`
   (reservado para rotinas administrativas futuras).

Essa alteração de `role`/`status` será exposta futuramente apenas através do
painel administrativo, usando o cliente `service_role`
(`src/lib/supabase/admin.ts`) a partir de código server-side — nunca a partir
do cliente `anon` do frontend.

## Fluxos implementados

### Cadastro (`signUpAction`)

1. Usuário preenche nome, e-mail e senha em `/register`.
2. Validação com Zod (`src/lib/validations/auth.ts`).
3. `supabase.auth.signUp(...)`, com `emailRedirectTo` apontando para
   `/auth/callback?next=/app`.
4. Supabase envia e-mail de confirmação. O trigger de criação de perfil roda
   imediatamente após o registro em `auth.users` (não depende da confirmação
   de e-mail).
5. Usuário confirma o e-mail → é redirecionado para `/auth/callback`, que
   troca o código pela sessão e o leva para `/app`.

### Login (`signInAction`)

1. `/login` envia e-mail/senha.
2. `supabase.auth.signInWithPassword(...)`.
3. Em caso de sucesso, redirect para `/app`. Em caso de erro, mensagem
   genérica ("E-mail ou senha inválidos") — não revela se o problema foi o
   e-mail ou a senha, para dificultar enumeração de contas.

### Logout (`signOutAction`)

`supabase.auth.signOut()` + redirect para `/login`. Disparado por um form
simples no `AppHeader` (`src/components/app/app-header.tsx`).

### Recuperação de senha

1. `/forgot-password` → `forgotPasswordAction` chama
   `supabase.auth.resetPasswordForEmail(email, { redirectTo: ".../auth/callback?next=/reset-password" })`.
2. A resposta ao usuário é **sempre genérica** ("se este e-mail existir,
   você receberá um link"), independentemente de o e-mail existir na base —
   evita enumeração de contas.
3. Usuário clica no link do e-mail → `/auth/callback` troca o código por uma
   sessão temporária de recuperação e redireciona para `/reset-password`.
4. Em `/reset-password`, `resetPasswordAction` chama
   `supabase.auth.updateUser({ password })`, usando a sessão temporária.
   Sem essa sessão (link inválido/expirado), a ação retorna erro.

## Proteção de rotas (middleware)

`src/middleware.ts` roda em toda request (exceto assets estáticos) e:

1. Renova a sessão via `updateSession` (`src/lib/supabase/middleware.ts`).
2. Se a rota começa com `/app` ou `/admin` e não há usuário autenticado,
   redireciona para `/login?next=<rota original>`.
3. Se a rota é `/login` ou `/register` e o usuário já está autenticado,
   redireciona para `/app`.

**Importante:** nesta etapa, `/admin` exige apenas estar autenticado — ainda
não há checagem de `role`. Isso será adicionado quando o painel
administrativo for implementado, junto com uma policy de RLS que restrinja
o acesso a perfis de terceiros.

## Onde cada coisa vive

| Responsabilidade | Arquivo |
|---|---|
| Server Actions de auth | `src/lib/auth/actions.ts` |
| Leitura de sessão/perfil atual | `src/lib/auth/session.ts` |
| Validação de entrada | `src/lib/validations/auth.ts` |
| Cliente Supabase (browser) | `src/lib/supabase/client.ts` |
| Cliente Supabase (server) | `src/lib/supabase/server.ts` |
| Cliente Supabase (admin/service_role) | `src/lib/supabase/admin.ts` |
| Renovação de sessão + proteção de rota | `src/middleware.ts`, `src/lib/supabase/middleware.ts` |
| Callback de confirmação/recuperação | `src/app/auth/callback/route.ts` |
| Migration (tabela, RLS, triggers) | `supabase/migrations/001_create_profiles.sql` |
| Tipos de domínio | `src/types/profile.ts`, `src/types/supabase.ts` |

## Próximos passos (fora do escopo desta etapa)

- Checagem de `role` no middleware/rotas para proteger `/admin` de fato.
- Policies de RLS adicionais para administradores lerem/editarem perfis de
  terceiros.
- Painel administrativo completo (clientes, usuários, planos, pagamentos,
  assinaturas, logs, cupons, configurações, auditoria).
