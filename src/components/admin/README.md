# components/admin

Componentes específicos do painel administrativo da PLATAFORMA. Nunca
importados pela área pública ou pela área do cliente.

Base visual: shadcn/ui (`src/components/ui`) e os blocos `sidebar-07` e
`dashboard-01` (estrutura de sidebar, header e cards). O que já existe no
projeto é reaproveitado de `src/components/app` (`MetricCard`, `PageHeader`,
`EmptyState`, `Pagination`, `SubscriptionStatusBadge`, `UserMenu`).

| Arquivo | Papel |
|---|---|
| `admin-shell.tsx`, `admin-sidebar.tsx`, `admin-header.tsx` | Casca global do `/admin` (não depende de `company`) |
| `admin-nav-items.ts` | Menu e rótulos do breadcrumb |
| `admin-filters.tsx` | Busca + filtros por `<form method="get">` (estado na URL) |
| `admin-badges.tsx`, `admin-subscription-cell.tsx` | Status, papel e assinatura em tabelas |
| `admin-user-actions.tsx` | Suspender/reativar e alterar papel conforme a hierarquia (UX; o banco decide) |
| `coming-soon.tsx` | Página controlada "em breve" |
