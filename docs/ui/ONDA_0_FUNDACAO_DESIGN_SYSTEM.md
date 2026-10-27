# Prime Ges — Fundação do design system (Onda 0)

Data: 26/10/2026 · Branch: `ui/onda-0-design-system` (local, a partir de `origin/main` `709817b`) · Relatório de execução: [`RELATORIO_ONDA_0_FUNDACAO_DESIGN_SYSTEM.md`](./RELATORIO_ONDA_0_FUNDACAO_DESIGN_SYSTEM.md)

Este documento é o mapa de referência para as próximas ondas de UI. Tudo o que está aqui foi conferido no código do checkout; o que depende de navegador ou de conta autorizada está marcado como **não verificado**.

## 1. Stack e restrições de compatibilidade

| Item | Valor atual | Regra |
|---|---|---|
| Next.js | `^16.3.8` (App Router, `--webpack`) | mantido |
| React / ReactDOM | `^18.3.1` | **não** migrar para 19 |
| Tailwind CSS | `^3.4.9` + `tailwindcss-animate` | **não** migrar para 4 |
| shadcn/ui | `components.json` `style: "default"`, `rsc: true`, `baseColor: slate` | componentes editados à mão |
| Primitivas | **Radix UI** (17 pacotes `@radix-ui/react-*`) | **não** misturar com Base UI |
| Zod | `^3.23.8` | **não** migrar para 4 |
| Formulários | Server Actions + `useActionState` (sem react-hook-form) | não alterar contratos |
| Tabelas | `components/ui/table.tsx` + tabelas por entidade (sem TanStack) | não introduzir TanStack/nuqs |
| Auth / dados / cobrança | Clerk · Supabase (RLS/RPC) · EvoPay | fora do escopo de UI |

Kiranism e ShadcnStore (Base UI, Tailwind 4, React 19, Zod 4, TanStack Table 9) servem como **referência de composição e hierarquia**, não como código a copiar. Qualquer incorporação exige verificar a implementação e a licença do trecho antes.

## 2. Tokens e tema (dark-only)

O tema é **exclusivamente escuro**: `src/app/layout.tsx` fixa `class="dark"` no `<html>`; `ui/sonner.tsx` usa `theme="dark"`; não há `next-themes` nem alternância. Os tokens claros de `:root` continuam definidos (dormentes) porque a decisão de tema do produto está pendente. Esta onda não altera nada disso (coberto por `tests/unit/design-tokens.test.mjs`).

### 2.1 Tokens efetivos (fonte: `src/app/globals.css`, mapeados em `tailwind.config.ts`)

| Token (classe Tailwind) | `.dark` (valor efetivo hoje) | `:root` (dormente) |
|---|---|---|
| `background` / `foreground` | `212 31% 10%` / `212 39% 94%` | `0 0% 100%` / `222 47% 11%` |
| `card` / `card-foreground` | `211 31% 13%` / `212 39% 94%` | `0 0% 100%` / `222 47% 11%` |
| **`popover` / `popover-foreground`** *(novo)* | `211 31% 13%` / `212 39% 94%` | `0 0% 100%` / `222 47% 11%` |
| `primary` / `primary-foreground` | `207 100% 54%` (#168BFF) / `0 0% 100%` | `222 47% 11%` / `210 40% 98%` |
| **`primary-solid`** *(novo)* | `211 89% 44%` | `211 89% 44%` |
| **`primary-solid-hover`** *(novo)* | `211 89% 39%` | `211 89% 39%` |
| **`primary-text`** *(novo)* | `207 100% 68%` | `207 100% 68%` |
| `secondary`, `muted`, `accent` (+ `-foreground`) | `212 30% 16%` / `213 15% 59%` (muted-fg) | `210 40% 96%` / `215 16% 47%` |
| `destructive` / `-foreground` | `0 91% 71%` / `0 0% 100%` (botão sólido usa `red-600`) | `0 84% 60%` |
| `border` / `input` / `ring` | `211 28% 20%` / `210 20% 44%` / `207 100% 54%` | `214 32% 91%` ×2 / `222 47% 11%` |
| `sidebar*` (`sidebar-background`, `-foreground`, `-border`, `-primary`, `-accent`, `-ring`) | `212 36% 9%` base | valores claros padrão shadcn |
| `success`, `warning` (+ `-foreground`) | `142 71% 45%`, `38 92% 50%` | idem |

### 2.2 Por que há três "azuis" (e por que não foram unificados)

Contraste calculado (fórmula WCAG de luminância relativa, **cálculo, não medição em navegador**):

| Uso | Cor | Contraste |
|---|---|---|
| Texto branco sobre `--primary` (`207 100% 54%`) | #1495FF (o comentário do CSS diz #168BFF) | **≈ 3,1:1** (abaixo de 4,5:1 para texto normal) |
| Texto branco sobre `--primary-solid` (`211 89% 44%`) | #0C6DD4 | ≈ 5,1:1 |
| Texto branco sobre `--primary-solid-hover` | #0B60BC | ≈ 6,2:1 |
| `--primary-text` sobre `background` / `card` / `sidebar` | #5CB6FF | ≈ 8,1 / 7,4 / 8,3:1 |

Trocar o botão default para `--primary` mudaria a cor de todos os botões primários (92 ocorrências de `Button`/`buttonVariants` em `src`) e derrubaria o contraste do texto branco. Por isso a Onda 0 **não substitui** o valor do botão: ela **nomeia** os valores que já estavam fixos (mesma convenção do botão destrutivo, em que `--destructive` é texto/borda e o botão sólido usa um tom mais escuro). Zero mudança visual.

### 2.3 Cores fixas remanescentes (deliberadamente não tocadas)

| Onde | Valor | Classificação | Decisão |
|---|---|---|---|
| `components/admin/admin-sidebar.tsx:101` | `text-[hsl(207_100%_68%)]` | = `primary-text` | Adiado para a Onda 5 (escopo AdminShell proibido nesta onda) |
| `components/marketing/pricing-card.tsx:22` | `text-[hsl(207_100%_72%)]` | variante local (72 %, ≠ 68 %) | Onda 1 (Home); decidir se vira `primary-text` |
| `components/shared/auth/auth-card.tsx:64` | gradiente com `hsl(266 88% 62% / .10)` (roxo) | decoração de marca | Onda 2 |
| `components/shared/auth/clerk-auth-appearance.ts` | hex espelhando tokens (+ `#70BEFF`) | **exigência do Clerk** (não aceita `hsl(var())`) | manter; ao mudar token, atualizar o hex |
| `app/global-error.tsx` | hex/estilos inline | fallback sem CSS global | manter |
| `components/ui/button.tsx` `destructive`/`success` | `red-600`/`green-700` | estados semânticos sólidos | manter |

## 3. Componentes canônicos

| Necessidade | Padrão recomendado (páginas novas / migração gradual) | Arquivo | Observações |
|---|---|---|---|
| Botão | `Button` / `buttonVariants` | `ui/button.tsx` | default agora via `bg-primary-solid` |
| Superfície | `Card*` | `ui/card.tsx` | base de `MetricCard`/`StatCard`/`DashboardCard` |
| Cabeçalho de página | `PageHeader` (`title`, `description?`, `eyebrow?`, `actions?`, `className?`) | `app/page-header.tsx` | 21 páginas o usam; **44 páginas** ainda montam `<h1>` à mão. Lacuna: sem slot de breadcrumb nem `as`/nível de heading |
| Indicador | **`MetricCard`** (`label`, `value`, `detail?`, `icon?`, `className?`) | `app/metric-card.tsx` | usado em 9 páginas (módulos + admin). Padrão para páginas novas |
| Indicador compacto | `StatCard` (`label`, `value`, `icon`) | `app/stat-card.tsx` | 5 componentes de estatística de módulo |
| Indicador com estado | `DashboardCard` (`label`, `value`, `icon`, `hint?`, `indicator?`) | `app/dashboard-card.tsx` | 6 consumidores (detalhes, abas de cliente) |
| Indicador do dashboard | classes `prime-kpi-*` / `prime-mini-stat` | CSS global | só `(app)/app/page.tsx`; Onda 3 |
| Estado vazio | `EmptyState` (`title`, `description?`, `actionLabel?`, `actionHref?`, `icon?`) | `app/empty-state.tsx` | só link como ação (sem botão/`onClick`); ~14 páginas |
| Confirmação | `ConfirmDialog` | `app/confirm-dialog.tsx` | consolidado (AlertDialog Radix) |
| Paginação | `Pagination` | `app/pagination.tsx` | rótulos default "cliente(s)"; passar `itemLabel*` |
| Esqueleto | `Skeleton` + `loading.tsx` de `/app` e `/admin` | `ui/skeleton.tsx` | um esqueleto único; sem skeleton por rota |
| Toast | Sonner (`toast.success/error`) | `ui/sonner.tsx` | tema fixo escuro |
| Tabelas | `ui/table.tsx` + `*-table.tsx` por entidade | `ui/table.tsx`, `app/*-table.tsx` | duplicadas e acopladas a botões de ação; sem abstração |
| Filtros | `AdminFilters` (form GET) no admin; `*-filters.tsx` client-side nos módulos | `admin/admin-filters.tsx`, `app/*-filters.tsx` | duas estratégias |

**Não remover nem renomear** `StatCard`, `DashboardCard`, `*-stats-row`, `prime-kpi-*` nesta fase; consolidar por onda (ver §6).

## 4. Inventário inicial de CSS legado `prime-*`

Gerado por script somente leitura (fora do repositório) que cruza definições em `globals.css`/`home-v2.css` com ocorrências literais em `src/**/*.ts(x)`. **Ocorrência literal ≠ prova de uso** (nomes montados dinamicamente não aparecem) e **ausência de ocorrência ≠ prova de que a regra é morta**: nada foi removido.

- 50 classes `.prime-*` únicas definidas (os "141" do relatório de auditoria contavam ocorrências de seletor, não classes).
- `globals.css` 3.241 linhas · `home-v2.css` 1.798 linhas (carregado depois; `layout.tsx` importa os dois).

| Família | Definição | Classes | Consumidores (TSX) | Risco de remover/migrar | Onda sugerida |
|---|---|---|---|---|---|
| `prime-module-*` | `globals.css` | 5 (base + agenda, caixa, equipe, fidelidade) | 15 arquivos; **12** variantes `--<módulo>` aparecem em TSX mas **só 4 têm regra CSS** (as outras 8 são marcadores sem estilo) | Médio (módulos); marcadores sem CSS são seguros de manter | 4 |
| `prime-kpi*`, `prime-attention*`, `prime-dashboard*`, `prime-panel*`, `prime-mini*`, `prime-health*`, `prime-progress*`, `prime-customer*`, `prime-onboarding*`, `prime-inline*`, `prime-live*`, `prime-no-chart` | `globals.css` | ~30 | `(app)/app/page.tsx` (26 classes distintas) + `relatorios/page.tsx` (8) | Alto para o dashboard (página inteira depende) | 3 |
| `prime-cta*`, `prime-site-header`, `prime-scroll*`, `prime-reveal*`, `prime-enter`, `prime-card` | `globals.css` + `home-v2.css` | ~12 | Home (`(public)/page.tsx`), `marketing/*` | Alto (cascata `home-v2` sobre `globals`, SEO, ISR) | 1 |
| `prime-mobile-*`, `prime-nav-link--active`, `prime-menu-button`, `prime-hero` | `globals.css` | 9 | **nenhum literal em TSX** — *candidatas* a legado dormente (menu antigo da Home) | Baixo–médio; confirmar com a Onda 1 antes de remover | 1 |
| `prime-agenda*` | `globals.css` | 1 | `agenda/page.tsx` | Baixo | 4 |

Observações: `prime-site-header--scrolled` é aplicado em TSX mas não tem regra CSS (modificador sem efeito); `prime-ges-relatorio-` e `prime-ges` em TSX são strings de nome de arquivo/produto, não classes.

## 5. Mudanças desta onda

| Arquivo | Mudança |
|---|---|
| `src/app/globals.css` | + `--popover`, `--popover-foreground`, `--primary-solid`, `--primary-solid-hover`, `--primary-text` (em `:root` e `.dark`); nenhum token existente foi alterado |
| `tailwind.config.ts` | + cores `popover` (DEFAULT/foreground) e `primary.solid`, `primary.solid-hover`, `primary.text` |
| `src/components/ui/button.tsx` | `default`: `bg-[hsl(211_89%_44%)] … hover:bg-[hsl(211_89%_39%)]` → `bg-primary-solid … hover:bg-primary-solid-hover` (mesmos valores) |
| `src/components/app/app-sidebar.tsx` | item ativo: `text-[hsl(207_100%_68%)]` → `text-primary-text` (mesmo valor) |
| `src/components/ui/badge.tsx` | variante `info`: idem |
| `tests/unit/design-tokens.test.mjs` | 8 testes estáticos (tokens, consumidores, dark-only, versões de stack) |

**Defeito encontrado e corrigido — tokens `popover` ausentes.** `ui/popover.tsx`, `dropdown-menu.tsx`, `select.tsx`, `tooltip.tsx` e `command.tsx` usam `bg-popover`/`text-popover-foreground`, mas `--popover` não existia no CSS nem no Tailwind: o CSS gerado **não continha** `.bg-popover` (confirmado no build anterior) e agora contém. Efeito esperado: essas superfícies flutuantes passam a ter o fundo do card (`211 31% 13%`) e o texto padrão. É uma **mudança visual intencional** (restaura o que os componentes já declaravam), a **confirmar em navegador** com conta autorizada — nada disso foi visto renderizado.

## 6. Sequência sugerida

1. **Onda 1 — Home:** decidir `pricing-card` (72 %), tratar as famílias `home-v2`/`prime-mobile-*`, menu mobile "Preços" (com teste de clique real), SEO/ISR intocados.
2. **Onda 2 — Shell e conta:** header/breadcrumb (`ui/breadcrumb` já existe), `AuthCard`/onboarding/conta com o mesmo card; manter provider Clerk e guards.
3. **Onda 3 — Dashboard:** migrar `prime-kpi-*` para `MetricCard`; decisão sobre gráficos (nova dependência exige autorização).
4. **Onda 4 — Módulos:** piloto em Clientes (toolbar + tabela + paginação); `PageHeader` nas 44 páginas manuais em lotes.
5. **Onda 5 — Admin:** `admin-sidebar` (token), `AdminFilters`, diálogos; matriz de papéis testada.

## 7. Limitações (exigem navegador ou conta autorizada)

Não verificados nesta onda: aparência real de dropdown/popover/tooltip/select após o token `popover`; contraste medido em navegador; responsividade; teclado/leitor de tela; fluxo autenticado. Não há E2E, regressão visual nem teste de acessibilidade no repositório (planejados para a onda de regressão).
