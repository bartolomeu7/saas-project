# Prime Ges

Fundação de um produto **SaaS** moderno, modular, seguro e preparado para produção.

> Status atual: **autenticação, multi-tenant, dashboard, Clientes, Produtos,
> Serviços, Vendas (com pagamentos, descontos e cancelamento), Fidelidade,
> Documentos de cliente, Sorteio/Ranking, Caixa e Billing/assinatura via
> EvoPay (Pix) implementados.** O painel administrativo da plataforma (`/admin`)
> tem o guard de acesso pronto, mas ainda nenhuma página de conteúdo.
> Estoque, Financeiro, Relatórios, Agenda e Equipe/Colaboradores ainda
> não têm backend — ver [`docs/architecture.md`](./docs/architecture.md)
> para o detalhe de cada módulo e [`docs/authentication.md`](./docs/authentication.md)
> para o fluxo de autenticação.

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
├── middleware.ts      # protege /app, /admin, /onboarding; guard de role e de assinatura; renova sessão
├── app/
│   ├── auth/callback/ # troca code por sessão (confirmação/recuperação)
│   ├── onboarding/    # criação da primeira empresa (fora do route group (app))
│   ├── (public)/      # landing, /login, /register, /forgot-password, /reset-password
│   ├── (app)/
│   │   └── app/
│   │       ├── page.tsx           # dashboard
│   │       ├── clientes/          # listagem, /novo, /[id], /[id]/editar
│   │       ├── produtos/          # produtos e categorias
│   │       ├── servicos/          # serviços e categorias
│   │       ├── vendas/            # nova venda, item, pagamento, cancelamento
│   │       ├── fidelidade/        # configurações, níveis, campanhas
│   │       └── assinatura/        # billing/assinatura (EvoPay)
│   ├── admin/         # painel da plataforma — segmento real (não route group);
│   │                  # guard pronto (src/lib/admin/guard.ts), sem página ainda
│   └── api/           # route handlers (webhook EvoPay, criação de cobrança Pix)
├── components/
│   ├── ui/            # componentes shadcn/ui (button, input, label, alert)
│   ├── shared/         # reutilizáveis (auth forms, headers)
│   ├── app/             # AppShell, sidebar e todos os módulos de negócio
│   └── admin/            # específicos do admin (ainda sem conteúdo)
├── lib/
│   ├── supabase/       # clientes Supabase (browser, server, admin, middleware)
│   ├── auth/             # server actions de auth + leitura de sessão/perfil
│   ├── admin/             # guard de acesso à plataforma (profiles.role)
│   ├── billing/           # guard de assinatura + integração EvoPay
│   ├── companies/         # leitura da empresa atual + criação (onboarding)
│   ├── customers/          # queries e server actions do módulo de clientes
│   ├── products/, services/, sales/, loyalty/  # demais módulos de negócio
│   └── validations/         # schemas Zod por módulo
├── hooks/               # ainda vazio
├── types/               # tipos de domínio por módulo + tipos do Supabase
└── config/               # configuração estática do projeto

supabase/
└── migrations/          # 001–021 (fundação, módulos e caixa)

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

6. Aplique todas as migrations no seu projeto Supabase, em ordem numérica
   (`supabase/migrations/001_create_profiles.sql` até a mais recente), pelo
   SQL Editor do dashboard ou via `supabase db push` se estiver usando o
   Supabase CLI.

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

Em produção (Vercel), `NEXT_PUBLIC_APP_URL` deve ser `https://primeges.com.br` —
configurado nas variáveis de ambiente do projeto na Vercel, não neste
repositório. Em desenvolvimento local, `.env.local` continua usando
`http://localhost:3000`.

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
