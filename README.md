# Micro SaaS

Fundação de um produto **SaaS** moderno, modular, seguro e preparado para produção.

> Status atual: **infraestrutura inicial**. Funcionalidades de negócio (autenticação,
> pagamentos, painel administrativo, etc.) ainda não foram implementadas — ver
> [`docs/architecture.md`](./docs/architecture.md) para o roadmap.

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
├── app/
│   ├── (public)/     # área pública (landing, login, signup)
│   ├── (app)/        # área autenticada do cliente
│   ├── (admin)/      # painel administrativo (isolado)
│   └── api/          # route handlers (webhooks, endpoints internos)
├── components/
│   ├── ui/           # componentes shadcn/ui
│   ├── shared/       # componentes reutilizáveis entre app/admin
│   ├── app/          # específicos da área do cliente
│   └── admin/        # específicos do admin
├── lib/
│   ├── supabase/     # clientes Supabase (browser, server, admin, middleware)
│   ├── auth/         # helpers de sessão e RBAC (futuro)
│   └── validations/  # schemas de validação (futuro)
├── hooks/
├── types/            # tipos globais + tipos gerados do Supabase
└── config/           # configuração estática do projeto

supabase/
└── migrations/       # SQL versionado do banco

docs/
└── architecture.md   # visão geral da arquitetura
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
   do projeto, "Micro SaaS" e o status "Aplicação Online".

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
