# Arquitetura

Este documento descreve a arquitetura atual do projeto e a direção planejada
para as próximas etapas. Além da fundação (auth, multi-tenant, clientes),
já estão implementados: Produtos, Serviços, Vendas (com pagamentos,
descontos e cancelamento), Fidelidade (configurações, níveis,
multiplicadores, campanhas, resgate de pontos), Documentos de cliente
(upload/Storage), Sorteio e Ranking de clientes, Caixa e Billing/assinatura
via EvoPay (Pix). O painel administrativo da plataforma (`/admin`) tem o guard
de acesso pronto, mas ainda nenhuma página de conteúdo.

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
                     │  (public) (app)  admin │
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
- Três áreas isoladas:
  - `(public)` — *route group* (sem afetar a URL): landing page, login/cadastro.
  - `(app)` — *route group*: área autenticada do cliente (dashboard, vendas,
    clientes, produtos, serviços, fidelidade, assinatura, etc.).
  - `admin` — **segmento real de URL** (`/admin`), não um route group. É de
    propósito: o guard de acesso em `src/middleware.ts` intercepta pelo path
    literal `/admin`; um route group `(admin)` não geraria esse segmento e
    ficaria fora do alcance do guard.
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
- Separação entre usuário comum e administrador é feita em três camadas —
  banco (RLS + trigger `protect_profile_restricted_fields`), aplicação
  (middleware, que já exige `profiles.role in ('admin', 'super_admin')`
  para `/admin`/`/admin/*` via `src/lib/admin/guard.ts`) e UI. A promoção de
  um usuário a `admin`/`super_admin` continua só por rotina administrativa
  (`service_role`), nunca pelo frontend.

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
- **Uma empresa por usuário — garantido, não só assumido:** `getCurrentCompany()`
  usa a primeira membership encontrada como "empresa atual" (sem seletor de
  empresa na UI), e `create_company_with_owner` rejeita a chamada se o
  usuário já pertencer a qualquer empresa — evita que chamadas concorrentes
  (ex.: duas abas no onboarding) deixem alguém com múltiplas empresas e
  `getCurrentCompany()` passando a devolver uma delas de forma
  não-determinística. O modelo de dados (`company_members`) já suportaria
  múltiplas memberships por usuário se um fluxo de convite/equipe
  compartilhada for implementado no futuro — hoje não existe esse fluxo, só
  o de onboarding (sempre como owner de uma empresa nova).
- **Exclusão de clientes — decisão de arquitetura:** lógica, via
  `status = 'inactive'`, não física. Motivos: (1) preserva a integridade
  referencial para quando vendas/serviços/ordens forem implementados e
  referenciarem `customer_id`; (2) evita perda acidental de dados e permite
  reativação; (3) é consistente com o padrão já adotado em `profiles`. Por
  isso, a policy de `DELETE` existe na tabela por completude/segurança, mas
  a aplicação nunca a utiliza — o fluxo de "Excluir" na UI sempre atualiza
  `status`, nunca remove a linha.
- **Dashboard (`/app`):** cada seção (Clientes, Vendas, Produtos, Serviços)
  usa dados reais do banco, um componente assíncrono por seção dentro de
  `<Suspense>` — nenhum dado fictício é exibido para indicadores que ainda
  não existem (Estoque, Financeiro e Relatórios continuam sem indicador;
  Caixa possui módulo próprio, mas não é tratado como indicador do dashboard).
- **Sidebar:** `AppShell` (`src/components/app/app-shell.tsx`) renderiza a
  navegação lateral (fixa no desktop, drawer no mobile). Habilitados hoje:
  Dashboard, Clientes, Produtos, Serviços, Vendas, Fidelidade, Caixa,
  Assinatura.
  Estoque, Financeiro, Relatórios e Configurações continuam desabilitados
  ("Em breve") — exigem schema/decisão de produto ainda
  inexistente. A lista completa vive em `src/components/app/nav-items.ts`.

## Painel administrativo (guard implementado — conteúdo planejado)

- Vive no mesmo projeto Next.js, no segmento real `src/app/admin/` (não um
  route group — ver explicação acima), com layout, componentes e regras de
  acesso próprios em `src/components/admin/`.
- Acesso restrito a `profiles.role in ('admin', 'super_admin')`, validado no
  `middleware` (`src/lib/admin/guard.ts`) — implementado e testado. RLS
  cross-empresa para `admin`/`super_admin` já existe em 7 tabelas
  (`billing_customers`, `subscriptions`, `company_entitlements`,
  `subscription_payments`, `audit_logs`, `customer_raffles`,
  `customer_raffle_entries`), mas ainda não em `profiles`.
- Conteúdo planejado (guard pronto, sem página ainda): dashboard, empresas,
  usuários, planos, assinaturas, pagamentos, APIs, consumo, logs, webhooks,
  cupons, configurações, administradores, permissões, auditoria.

## Pagamentos (implementado — Billing/EvoPay)

- Provedor: **EvoPay** (Pix), integrado em `src/lib/billing/`
  (`src/lib/billing/evopay.ts` fala com a API externa; `src/lib/billing/guard.ts`
  expõe `getActiveSubscription`/`getSubscriptionGuardStatus`, no mesmo molde
  Edge-safe do guard de `/admin`).
- Webhook dedicado em `src/app/api/webhooks/evopay/route.ts`, que valida a
  autenticidade do evento antes de chamar `confirmPaymentFromProvider`.
  `assertOwnPayment` garante que um pagamento só é confirmado para a empresa
  a que pertence.
- Nenhuma chave EvoPay é exposta ao frontend; toda comunicação com o provedor
  acontece server-side.
- `src/middleware.ts` bloqueia `/app/*` (qualquer role, incluindo owner) para
  empresas sem assinatura `trialing`/`active` não expirada, redirecionando
  para `/app/assinatura`.

## Caixa (implementado)

- O módulo de caixa vive em `src/app/(app)/app/caixa/` e em `src/lib/cash-register/`.
- A migration `021_cash_register_foundation.sql` cria `cash_registers` e `cash_movements`, com operações protegidas por RPCs `SECURITY DEFINER`.
- Owner/admin podem abrir, fechar e lançar movimentações manuais; employee é somente leitura.
- Pagamentos de vendas confirmados geram movimentações automáticas quando existe caixa aberto. O saldo físico em dinheiro é separado do total de movimentações por método de pagamento.
- Cancelamento de venda não estorna automaticamente a movimentação de caixa; isso permanece como limitação conhecida até a implementação de estorno financeiro.

## APIs externas

- EvoPay (pagamentos Pix, ver acima) é a primeira e única integração externa
  isolada em `lib/` (`src/lib/billing/evopay.ts`), nunca chamada diretamente
  do frontend — sempre a partir de Server Actions ou do Route Handler do
  webhook.
- Novas integrações devem seguir o mesmo padrão: módulo próprio em `lib/`,
  rate limiting e tratamento de erro padronizado antes de expor qualquer
  endpoint que dependa dela.

## Ambientes

| Ambiente | Projeto Supabase | Deploy Vercel |
|---|---|---|
| Development | projeto Supabase de dev | `npm run dev` local |
| Preview/Staging | projeto Supabase de dev ou staging | Preview deployment (por PR/branch) |
| Production | projeto Supabase de produção | Deploy de `main` |

Cada ambiente tem seu próprio conjunto de variáveis de ambiente, configurado
na Vercel — nunca compartilhado nem commitado no repositório.
