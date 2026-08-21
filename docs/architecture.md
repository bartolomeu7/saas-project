# Arquitetura

Este documento descreve a arquitetura atual do projeto e a direção planejada
para as próximas etapas. Nesta fase, apenas a **fundação** está implementada.

## Visão geral

```
                     ┌───────────────────────┐
                     │        Vercel         │
                     │   (build + deploy)    │
                     └───────────┬───────────┘
                                 │
                     ┌───────────▼───────────┐
                     │   Next.js (App Router) │
                     │  React + TypeScript    │
                     │                        │
                     │  (public) (app) (admin)│
                     │        api/            │
                     └───────────┬───────────┘
                                 │
                     ┌───────────▼───────────┐
                     │       Supabase         │
                     │  Auth · Postgres ·     │
                     │  Storage · Edge Fns    │
                     └────────────────────────┘
```

## Frontend

- **Next.js (App Router) + React + TypeScript**, com Tailwind CSS e shadcn/ui
  para a camada visual.
- Três áreas isoladas por *route groups*, sem afetar a URL:
  - `(public)` — landing page, páginas de login/cadastro (futuro).
  - `(app)` — área autenticada do cliente (dashboard, conta, etc.).
  - `(admin)` — painel administrativo, com layout e regras de acesso próprios.
- `api/` concentra Route Handlers (ex: webhooks) que precisam rodar no servidor.
- Componentes divididos em `ui` (shadcn/ui), `shared` (reutilizáveis), `app` e
  `admin` — evitando que componentes administrativos vazem para a área pública
  e vice-versa.

## Backend

- Não há um backend customizado separado: o **Supabase** cumpre esse papel
  (banco, autenticação, storage, funções server-side).
- Lógica que precisa de privilégios elevados ou de rodar fora do ciclo de
  request/response do Next.js (ex: processar um webhook de pagamento) usará
  **Supabase Edge Functions** ou **Route Handlers** do Next.js — a decisão
  entre um e outro será tomada caso a caso, quando a funcionalidade for
  implementada.

## Banco de dados

- **PostgreSQL**, gerenciado pelo Supabase.
- Schema versionado em `supabase/migrations/`, nunca alterado diretamente
  pelo dashboard sem uma migration correspondente commitada.
- `001_create_profiles.sql` cria a primeira tabela de negócio: `public.profiles`,
  vinculada a `auth.users`, com enums `user_role` e `user_status`, trigger de
  criação automática de perfil e RLS habilitado desde a criação — nenhuma
  tabela fica com RLS desabilitado "para resolver depois".
- `002_create_companies_customers.sql` cria a estrutura multi-tenant
  (`public.companies`, `public.company_members`) e o primeiro módulo de
  negócio (`public.customers`). Ver seção "Multi-tenant" abaixo.

## Autenticação (implementado — Etapa 2)

- **Supabase Auth** com e-mail/senha. Provedores sociais podem ser avaliados
  futuramente, sem exigir mudança de arquitetura.
- Sessão gerenciada via cookies, renovada a cada request pelo `middleware.ts`
  (`src/lib/supabase/middleware.ts`), que também decide se a rota atual exige
  autenticação.
- Fluxos implementados: cadastro, login, logout, recuperação de senha,
  atualização de senha — todos via **Server Actions** (`src/lib/auth/actions.ts`),
  nunca expondo lógica sensível ao client. Ver detalhes em
  [`docs/authentication.md`](./authentication.md).
- **RBAC** inicial: tabela `public.profiles` com coluna `role`
  (`user | admin | super_admin`) e `status` (`active | inactive | suspended`),
  criada e mantida em sincronia com `auth.users` por trigger — nunca por
  lógica duplicada no frontend. Ver `supabase/migrations/001_create_profiles.sql`.
- Defesa em profundidade na alteração de `role`/`status`/`user_id`: RLS
  garante que o usuário só edita a própria linha; um trigger dedicado
  (`protect_profile_restricted_fields`) impede que esses três campos sejam
  alterados por qualquer sessão que não seja `service_role`.
- Separação entre usuário comum e administrador continua sendo feita em três
  camadas — banco (RLS + trigger), aplicação (middleware, hoje só checando
  autenticação) e UI — mas a checagem de **role** no middleware/rotas para o
  `/admin` ainda não foi implementada (planejada para a etapa do painel
  administrativo).

## Multi-tenant, Dashboard e Clientes (implementado — Etapa 3)

- **Modelo de dados:** `public.companies` (empresa/tenant) ↔ `public.company_members`
  (vínculo usuário↔empresa, com `role`: `owner | admin | employee`) ↔
  `public.customers` (primeiro módulo de negócio, com `company_id` obrigatório).
  Todo módulo futuro (produtos, vendas, estoque, financeiro, etc.) deve seguir
  o mesmo padrão: coluna `company_id` + policies via `company_members`.
- **Isolamento multi-tenant:** garantido no banco via RLS, nunca apenas na
  aplicação. As policies de `customers` restringem toda operação (select,
  insert, update) a linhas cujo `company_id` pertença a uma empresa da qual
  o usuário é membro (`company_members.user_id = auth.uid()`). Um usuário da
  Empresa A nunca consegue ler, criar ou editar dados da Empresa B — mesmo
  que manipule a URL ou o payload da requisição.
- **Criação de empresa:** feita exclusivamente pela função de banco
  `create_company_with_owner` (`SECURITY DEFINER`), que insere a empresa e a
  membership "owner" numa única transação atômica. Isso resolve o problema
  de "ovo e galinha": no momento da criação, o usuário ainda não é membro de
  nenhuma empresa, então um INSERT direto do frontend em `company_members`
  não teria como passar pelas policies (que exigem pertencimento prévio).
  Nenhum `user_id`, `role` ou `company_id` é aceito do frontend nesse fluxo —
  a função resolve tudo a partir de `auth.uid()`.
- **Onboarding:** usuário autenticado sem nenhuma empresa é redirecionado
  para `/onboarding` (rota fora do route group `(app)`, para evitar loop de
  redirecionamento com o próprio layout que faz essa checagem). Após criar a
  empresa, é redirecionado para `/app`.
- **Suposição desta etapa:** cada usuário pertence a uma única empresa. O
  modelo de dados já suporta múltiplas memberships por usuário (útil para
  futuros convites/equipes compartilhadas), mas a UI usa a primeira
  membership encontrada como "empresa atual" — não há troca de empresa na
  interface ainda.
- **Exclusão de clientes — decisão de arquitetura:** lógica, via
  `status = 'inactive'`, não física. Motivos: (1) preserva a integridade
  referencial para quando vendas/serviços/ordens forem implementados e
  referenciarem `customer_id`; (2) evita perda acidental de dados e permite
  reativação; (3) é consistente com o padrão já adotado em `profiles`. Por
  isso, a policy de `DELETE` existe na tabela por completude/segurança, mas
  a aplicação nunca a utiliza — o fluxo de "Excluir" na UI sempre atualiza
  `status`, nunca remove a linha.
- **Dashboard (`/app`):** cards de Clientes usam dados reais do banco
  (`getCustomerStats`); Faturamento, Vendas e Serviços mostram "Em breve" —
  nenhum dado fictício é exibido para indicadores que ainda não existem.
- **Sidebar:** `AppShell` (`src/components/app/app-shell.tsx`) renderiza a
  navegação lateral (fixa no desktop, drawer no mobile). Apenas Dashboard e
  Clientes estão habilitados; os demais itens aparecem desabilitados
  ("Em breve") — a lista completa vive em `src/components/app/nav-items.ts`.

- Vive no mesmo projeto Next.js, isolado pelo route group `(admin)`, com
  layout, componentes e regras de acesso próprios.
- Acesso restrito a usuários com role administrativa, validado tanto no
  `middleware` quanto no banco (RLS).
- Funcionalidades planejadas (não implementadas ainda): dashboard, clientes,
  usuários, planos, assinaturas, pagamentos, APIs, consumo, logs, webhooks,
  cupons, configurações, administradores, permissões, auditoria.

## Pagamentos (futuro)

- Integração com um provedor de pagamentos (a definir) via Route Handler
  dedicado para receber e validar webhooks.
- Nenhuma chave de pagamento será exposta ao frontend; toda comunicação
  sensível acontece server-side.
- Validação de assinatura/autenticidade de cada webhook antes de processar
  qualquer evento.

## APIs externas (futuro)

- Integrações de terceiros isoladas em módulos próprios dentro de `lib/`,
  nunca chamadas diretamente do frontend quando envolverem segredos.
- Rate limiting e tratamento de erro padronizado antes de expor qualquer
  endpoint que dependa de uma API externa.

## Ambientes

| Ambiente | Projeto Supabase | Deploy Vercel |
|---|---|---|
| Development | projeto Supabase de dev | `npm run dev` local |
| Preview/Staging | projeto Supabase de dev ou staging | Preview deployment (por PR/branch) |
| Production | projeto Supabase de produção | Deploy de `main` |

Cada ambiente tem seu próprio conjunto de variáveis de ambiente, configurado
na Vercel — nunca compartilhado nem commitado no repositório.
