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
- Nenhuma tabela de negócio existe ainda. O schema será versionado em
  `supabase/migrations/`, nunca alterado diretamente pelo dashboard sem uma
  migration correspondente commitada.
- **Row Level Security (RLS)** será habilitado em toda tabela desde o momento
  em que ela for criada — nenhuma tabela ficará com RLS desabilitado "para
  resolver depois".

## Autenticação (futuro)

- **Supabase Auth** (email/senha como base; provedores sociais avaliados
  conforme necessidade).
- Sessão gerenciada via cookies, com renovação automática feita no
  `middleware.ts` (já preparado nesta etapa, ainda sem regras de autorização).
- Separação clara entre usuário comum e administrador via tabelas de
  `roles` / `user_roles` (RBAC), validada em três camadas: banco (RLS),
  aplicação (middleware/rotas) e UI (o que é exibido).

## Painel administrativo (futuro)

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
