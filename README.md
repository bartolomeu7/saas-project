# Prime Ges

Fundação de um produto **SaaS** moderno, modular, seguro e preparado para produção.

> Status atual: **autenticação, multi-tenant, dashboard e módulo de Clientes
> implementados** (Etapas 1–3). Pagamentos, planos, assinaturas, demais
> módulos de negócio (produtos, serviços, vendas, estoque, financeiro) e o
> painel administrativo global ainda não foram implementados — ver
> [`docs/architecture.md`](./docs/architecture.md) para o roadmap e
> [`docs/authentication.md`](./docs/authentication.md) para o fluxo de
> autenticação.

## Stack

- [Next.js](https://nextjs.org/) (App Router) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- [Supabase](https://supabase.com/) (Postgres, Auth, Storage, Edge Functions)
- [GitHub](https://github.com/) para versionamento
- [Vercel](https://vercel.com/) para deploy

## Requisitos

- Node.js 20 LTS ou superior
- npm 10 ou superior
- Conta no [Supabase](https://supabase.com/) (projeto criado)
- Conta no [GitHub](https://github.com/)
- Conta na [Vercel](https://vercel.com/) (para deploy)

## Estrutura do projeto

```
src/
├── middleware.ts      # protege /app, /admin, /onboarding; renova sessão
├── app/
│   ├── auth/callback/ # troca code por sessão (confirmação/recuperação)
│   ├── onboarding/    # criação da primeira empresa (fora do route group (app))
│   ├── (public)/      # landing, /login, /register, /forgot-password, /reset-password
│   ├── (app)/
│   │   └── app/
│   │       ├── page.tsx           # dashboard
│   │       └── clientes/          # listagem, /novo, /[id], /[id]/editar
│   ├── (admin)/       # painel administrativo (isolado, ainda vazio)
│   └── api/           # route handlers (webhooks, endpoints internos)
├── components/
│   ├── ui/            # componentes shadcn/ui (button, input, label, alert)
│   ├── shared/         # reutilizáveis (auth forms, headers)
│   ├── app/             # AppShell, sidebar, dashboard e módulo de clientes
│   └── admin/            # específicos do admin
├── lib/
│   ├── supabase/       # clientes Supabase (browser, server, admin, middleware)
│   ├── auth/             # server actions de auth + leitura de sessão/perfil
│   ├── companies/         # leitura da empresa atual + criação (onboarding)
│   ├── customers/          # queries e server actions do módulo de clientes
│   └── validations/         # schemas Zod (auth, company, customer)
├── hooks/
├── types/               # Profile, Company, Customer + tipos do Supabase
└── config/               # configuração estática do projeto

supabase/
└── migrations/
    ├── 001_create_profiles.sql
    └── 002_create_companies_customers.sql   # companies, company_members, customers, RLS

docs/
├── architecture.md     # visão geral da arquitetura
└── authentication.md   # fluxo de autenticação em detalhe
```

## Como executar localmente

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Copie o arquivo de variáveis de ambiente de exemplo:

   ```bash
   cp .env.example .env.local
   ```

3. Preencha `.env.local` com os valores do seu projeto Supabase (veja a seção
   abaixo). **Nunca** faça commit de `.env.local`.

4. Rode o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

5. Acesse [http://localhost:3000](http://localhost:3000). Você deve ver o nome
   do projeto "Prime Ges" e o status "Aplicação Online".

6. Aplique as migrations no seu projeto Supabase, em ordem, antes de testar
   (`supabase/migrations/001_create_profiles.sql` e depois
   `002_create_companies_customers.sql`), pelo SQL Editor do dashboard ou via
   `supabase db push` se estiver usando o Supabase CLI.

7. No primeiro acesso, você será redirecionado para `/onboarding` para criar
   sua empresa antes de chegar ao dashboard.

## Variáveis de ambiente

Definidas em `.env.example` (sem valores reais):

| Variável | Descrição | Exposta ao browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase | Sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública (anon), protegida por RLS | Sim |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave administrativa, ignora RLS | **Não — apenas server-side** |
| `NEXT_PUBLIC_APP_URL` | URL pública da aplicação | Sim |
| `NEXT_PUBLIC_APP_ENV` | `development` \| `staging` \| `production` | Sim |

Onde encontrar as chaves do Supabase: **Project Settings → API** no dashboard
do seu projeto.

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Roda o build de produção localmente |
| `npm run lint` | Roda o ESLint |
| `npm run typecheck` | Verifica tipos TypeScript sem gerar build |

## Segurança

- Nenhuma chave/segredo é versionado no Git (`.env*` está no `.gitignore`).
- A chave `SUPABASE_SERVICE_ROLE_KEY` nunca é usada no frontend.
- Todas as tabelas do Supabase, quando criadas, terão Row Level Security (RLS)
  habilitado desde o primeiro momento.

## Deploy

Este projeto é preparado para deploy na Vercel a partir do repositório GitHub,
com variáveis de ambiente configuradas separadamente para os ambientes
**Production**, **Preview** e **Development**. Ver `docs/architecture.md` para
mais detalhes.
