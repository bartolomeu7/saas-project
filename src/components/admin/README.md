# components/admin

Componentes específicos do painel administrativo da PLATAFORMA. Nunca
importados pela área pública ou pela área do cliente.

Base visual: shadcn/ui (`src/components/ui`) e os blocos `sidebar-07` e
`dashboard-01` (estrutura de sidebar, header e cards). O que já existe no
projeto é reaproveitado de `src/components/app` (`MetricCard`, `PageHeader`,
`EmptyState`, `Pagination`, `SubscriptionStatusBadge`, `ConfirmActionForm`, `UserMenu`).

| Arquivo | Papel |
|---|---|
| `admin-shell.tsx`, `admin-sidebar.tsx`, `admin-header.tsx` | Casca global do `/admin` (não depende de `company`) |
| `admin-nav-items.ts` | Menu e rótulos do breadcrumb |
| `admin-filters.tsx` | Busca + filtros + datas por `<form method="get">` (estado na URL) |
| `admin-badges.tsx`, `admin-subscription-cell.tsx` | Status, papel, presença, pagamento e categoria de auditoria |
| `admin-action-dialog.tsx` | Botão + modal (shadcn `Dialog`) genérico para formulários que chamam Server Actions |
| `company-access-actions.tsx` | Operações de acesso/cobrança de uma empresa (conceder dias, 30 dias, pagamento manual, plano, reativar, ajustar, cancelar) |
| `admin-user-actions.tsx` | Suspender/reativar e alterar papel conforme a hierarquia (UX; o banco decide) |
| `admin-detail-parts.tsx` | Cartões de assinatura, pagamentos e histórico de auditoria |
| `admin-charts.tsx` | Gráficos leves (barras e distribuição) sem biblioteca, com tabela equivalente para leitor de tela |

Nada aqui concede permissão: esconder um botão não é segurança. Cada ação chama
uma Server Action (`src/lib/admin/actions.ts`) que repassa para uma RPC
`SECURITY DEFINER`, e é a RPC que decide.
