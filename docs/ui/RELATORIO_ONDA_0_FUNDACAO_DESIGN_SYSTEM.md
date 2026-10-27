# Relatório — Onda 0: Fundação do design system

Data: 26/10/2026 · Idioma: pt-BR · Documento de referência: [`ONDA_0_FUNDACAO_DESIGN_SYSTEM.md`](./ONDA_0_FUNDACAO_DESIGN_SYSTEM.md)

## 1. Estado final: **PASS** (com verificações de navegador **BLOCKED**, listadas no item 9)

Alteração pequena (5 arquivos editados, 2 criados de código/teste + 2 documentos), sem commit, sem push, sem dependências novas. O defeito dos tokens `popover` é uma correção visual intencional que **precisa de confirmação em navegador**.

## 2. Identidade do checkout

| Item | Valor |
|---|---|
| Caminho | `C:\Users\HAKARI\Downloads\saas-project\saas-project-fase3` (git worktree) |
| Branch de trabalho | `ui/onda-0-design-system` (local, criada com `--no-track`; não publicada) |
| Base | `origin/main` @ `709817b` ("docs(release): registrar Go Live da Etapa 6") |
| HEAD final | `709817b` (nenhum commit novo) |
| Branch anterior | `perf/etapa-6-clerk-scope` @ `c98233e` (preservada, sem alterações) |
| PR #41 | **MERGED** em 2026-10-27T00:26:05Z (`gh pr view 41 --json …`, somente leitura). Mesclado como *squash* (`fc6cf8c`); `c98233e` **não** é ancestral de `main`, mas `git diff c98233e origin/main -- src tests package.json package-lock.json components.json tailwind.config.ts` é **vazio** (só `docs/qa/etapa-6/GO_LIVE_FINAL.md` difere). O código da Etapa 6 está em `main`. |
| Produção | não consultada; nenhum deploy feito. Este trabalho termina localmente. |

## 3. Estado Git antes/depois

- **Antes** (`perf/etapa-6-clerk-scope`): árvore rastreada limpa; 5 itens não rastreados — `.playwright-mcp/`, `.serena/`, `docs/AUDITORIA_GO_LIVE_2026-10-18_a_21.md`, `supabase/candidates/` (preexistentes) e `AUDITORIA_UI_PRIME_GES_FUSAO_TEMPLATES.md` (criado na auditoria anterior desta sessão).
- Troca de branch (`git switch -c ui/onda-0-design-system --no-track origin/main`) só com itens **não rastreados**; nenhum deles existe em `origin/main`, então nada foi sobrescrito.
- **Depois:** modificados `src/app/globals.css`, `src/components/app/app-sidebar.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/button.tsx`, `tailwind.config.ts`; novos `tests/unit/design-tokens.test.mjs`, `docs/ui/ONDA_0_FUNDACAO_DESIGN_SYSTEM.md`, `docs/ui/RELATORIO_ONDA_0_FUNDACAO_DESIGN_SYSTEM.md`. Todos os itens preexistentes foram preservados. Nenhum arquivo apagado.

## 4. Mudanças de código

| Arquivo | Problema | Solução | Efeito esperado |
|---|---|---|---|
| `globals.css` | `bg-popover`/`text-popover-foreground` usados em 5 componentes `ui`, mas `--popover` inexistente; HSL do botão e da sidebar fixos no JSX | + `--popover`, `--popover-foreground`, `--primary-solid`, `--primary-solid-hover`, `--primary-text` em `:root` e `.dark` | Fonte única para esses valores; nenhum token existente alterado |
| `tailwind.config.ts` | tokens acima sem classe | + `popover.{DEFAULT,foreground}`, `primary.{solid,solid-hover,text}` | classes `bg-popover`, `bg-primary-solid`, `hover:bg-primary-solid-hover`, `text-primary-text` |
| `ui/button.tsx` | `bg-[hsl(211_89%_44%)]` / hover `39%` | `bg-primary-solid … hover:bg-primary-solid-hover` | **idêntico** visualmente |
| `app/app-sidebar.tsx` | item ativo `text-[hsl(207_100%_68%)]` | `text-primary-text` | **idêntico** visualmente |
| `ui/badge.tsx` | `info` com o mesmo HSL fixo | `text-primary-text` | **idêntico** visualmente |
| `tests/unit/design-tokens.test.mjs` | sem trava para tokens/dark-only | 8 testes estáticos | impede regressão dos tokens e do tema |

## 5. Tokens (antes → depois)

- `--primary` (`207 100% 54%`) **inalterado**; `--ring`, `--card` e demais **inalterados**.
- Botão default: `hsl(211 89% 44%)`/`39%` (fixo) → `--primary-solid`/`--primary-solid-hover` com **os mesmos valores**. Justificativa para não usar `--primary`: texto branco sobre ele dá ≈ 3,1:1 (cálculo) contra ≈ 5,1:1 do tom atual, e a troca mudaria a cor de todos os botões primários (92 ocorrências). Decisão: preservar e nomear, documentado para decisão futura.
- Sidebar/badge: `hsl(207 100% 68%)` (fixo) → `--primary-text` (mesmo valor). **Não** é a mesma cor de `--primary` (54 %): é a variante clara para texto sobre fundo escuro.
- `--popover` = `211 31% 13%` (igual ao card) no `.dark`; `0 0% 100%` no `:root`.
- **Tema continua dark-only:** `<html class="dark">` intacto (`layout.tsx` sem alteração), sem `next-themes`, `:root` claro preservado.

## 6. Matriz canônica

| Componente | Padrão recomendado | Adiado deliberadamente |
|---|---|---|
| Button | `Button`/`buttonVariants` (agora com token) | tema/variantes novas |
| Card | `Card*` | — |
| PageHeader | `PageHeader` (sem breadcrumb/nível de heading) | migrar 44 páginas manuais; estender a API |
| Indicador | **`MetricCard`** para páginas novas; `StatCard` (compacto, 5 componentes) e `DashboardCard` (com hint/indicador, 6 consumidores) mantidos | unificação; `prime-kpi-*` do dashboard (Onda 3) |
| EmptyState | `EmptyState` (ação só por link) | variante com botão |
| ConfirmDialog | `ConfirmDialog` | — |
| Pagination | `Pagination` (passar `itemLabel*`) | rótulos default genéricos |
| Skeleton | `Skeleton` + `loading.tsx` de `/app`, `/admin` | skeleton por rota |
| Tabelas/filtros | `ui/table` + tabelas por entidade; `AdminFilters` (GET) × filtros client | abstração (Onda 4, piloto em Clientes) |
| Sonner | `toast.*` | tema não-dark |

Detalhe das props e usos: documento de referência §3.

## 7. Matriz CSS `prime-*` inicial

50 classes únicas; famílias, consumidores e risco no documento de referência §4. Pontos de atenção: só 4 das 12 variantes `prime-module-page--<módulo>` têm regra CSS; `prime-mobile-*`, `prime-nav-link--active`, `prime-menu-button`, `prime-hero` não têm consumidor literal (candidatas a legado, **nada removido**); o dashboard concentra 26 classes distintas em uma página. *Correção ao relatório de auditoria:* "141 regras `.prime-*`" eram ocorrências de seletor; as classes únicas são 50.

## 8. Testes (executados nesta sessão, branch `ui/onda-0-design-system`)

| Comando | Resultado real | Código |
|---|---|---|
| `npm run test:unit` — **baseline antes de editar** | 261 testes · 260 pass · 0 fail · 1 skipped · ~0,96 s | 0 |
| `npm run test:unit` — depois | 269 testes · 268 pass · 0 fail · 1 skipped · ~0,95 s (+8 testes novos) | 0 |
| `node --test tests/unit/performance-clerk-scope.test.mjs tests/unit/design-tokens.test.mjs` | 17 pass · 0 fail | 0 |
| `npm run lint` | 0 erros · 10 avisos (mesmos avisos já existentes, p. ex. `react-hooks/set-state-in-effect` em `use-mobile.tsx`) | 0 |
| `npm run typecheck` | sem erros | 0 |
| `npm run build` (variáveis fictícias do CI; nenhuma credencial real) | compilou; `Proxy (Middleware)` presente; log no scratchpad da sessão | 0 |
| `npm run test:seo` (com o build; **sem** `SEO_BASE_URL`) | 37 pass · 0 fail (os grupos que exigem servidor ficam pulados; os 44 reportados na Etapa 6 provavelmente incluíam esses grupos — não reexecutado aqui) | 0 |
| Conferência do CSS gerado | `.bg-popover`, `.text-popover-foreground`, `.bg-primary-solid`, `.text-primary-text` presentes; tokens `--primary-solid:211 89% 44%`, `--primary-solid-hover:211 89% 39%`, `--primary-text:207 100% 68%`, `--popover:211 31% 13%` presentes; `bg-primary-solid-hover` presente; sem o HSL arbitrário antigo | — |
| `git diff --check` | sem avisos | 0 |

Os testes unitários usam `fetch` simulado (confirmado por leitura de `billing.test.mjs` e `evopay-client.test.mjs`) e não chamam serviços externos. Resultados da Etapa 6 **não** foram reaproveitados.

## 9. Validações bloqueadas / não feitas

- **Navegador:** tentei abrir a build local no navegador do app; o middleware do Clerk redirecionou para o *handshake* do domínio fictício do CI (`ci-placeholder.clerk.accounts.dev`) e a verificação foi abandonada (usar chaves reais/TEST está fora desta onda). Servidor parado depois. **Cor computada do botão, aparência de dropdown/popover/tooltip/select, responsividade, contraste medido, teclado: NÃO verificados.**
- Teste autenticado e fluxo de login: BLOCKED (sem conta autorizada; proibido usar contas reais).
- `tests/integration/*`, `tests/sql/*`: não executados (exigem banco/credenciais).
- Screenshots antes/depois: nenhum disponível sem login; `.playwright-mcp/` tem imagens antigas da Home que não foram usadas.

## 10. Riscos restantes e decisões pendentes

1. **Popover/dropdown/select/tooltip/command passam a ter fundo** (antes: sem regra, logo transparente). É o comportamento declarado nos componentes, mas é mudança visual a confirmar em navegador (especialmente menu do usuário, notificações, selects de formulário).
2. `admin-sidebar.tsx:101` mantém o HSL fixo (AdminShell fora de escopo) e `pricing-card.tsx:22` usa 72 % (decidir na Onda 1).
3. Decisão de tema (dark-only × claro/escuro) continua pendente; os valores de `primary-solid`/`primary-text` no `:root` foram copiados do tema escuro para não mudar nada hoje.
4. Cor do Clerk (`clerk-auth-appearance.ts`) é hex à parte: qualquer mudança futura de `--primary` exige atualizar o hex.
5. Achados F-07 e F-10 da auditoria (corrida layout×página; autorização de Equipe/Agenda só nas RPCs) **não** foram tratados — exigem trabalho de segurança separado.

## 11. Próxima etapa recomendada

**Onda 1 — Home pública** (sem começar agora): preços/âncoras/menu mobile "Preços" com teste de clique real, família `home-v2`/`prime-mobile-*`, `pricing-card` (72 %), mantendo SEO, JSON-LD, ISR e textos. Antes, abrir/aprovar a revisão desta onda e confirmar o efeito dos tokens `popover` em navegador.

## 12. Checklist de aceite

| Item | Status | Evidência |
|---|---|---|
| Checkout/repositório correto | PASS | `package.json` `saas-project`, remoto `bartolomeu7/saas-project` |
| Situação do PR #41 e da Etapa 6 | PASS | `gh pr view 41`: MERGED; diff vazio de `src`/`tests` entre `c98233e` e `origin/main` |
| Git preservado; branch isolada | PASS | `ui/onda-0-design-system` sobre `709817b`; itens não rastreados intactos |
| Sem mudança de auth/guards/rotas/billing/banco/ações/contratos | PASS | `git diff --stat`: só CSS de tokens, Tailwind, 3 componentes de UI e testes/docs |
| React 18, Tailwind 3, Radix, Zod 3; sem dependência nova | PASS | `package.json`/lock inalterados; teste `design-tokens` confere versões |
| Tema escuro idêntico ao vigente | PASS | `layout.tsx` inalterado; teste cobre `class="dark"` |
| Correção de token só se segura | PASS | valores idênticos (sem mudança visual); decisão de não usar `--primary` documentada |
| Inventário canônico e duplicações | PASS | documento §3 |
| Inventário `prime-*` | PASS | documento §4 |
| Documento de fundação | PASS | `docs/ui/ONDA_0_FUNDACAO_DESIGN_SYSTEM.md` |
| Testes executados reportados | PASS | item 8 |
| `git diff --check` | PASS | sem saída (as linhas novas de `tailwind.config.ts` usam tabs puros; as vizinhas têm a indentação mista preexistente `␠␠	`, que o próprio `--check` acusaria se fossem editadas) |
| Diff pequeno e revisado | PASS | 5 arquivos, +27/−4 em código; revisão integral abaixo |
| Nenhum commit/push/merge/deploy | PASS | HEAD = `709817b` |
| Verificação visual em navegador | **BLOCKED** | item 9 |

## 13. Diff revisado (resumo)

`globals.css` +16 (tokens e comentários) · `tailwind.config.ts` +9/−1 · `button.tsx`, `app-sidebar.tsx`, `badge.tsx` ±1 linha cada. Nenhum arquivo de auth, rotas, middleware, layouts, Server Actions, schemas, lock ou `package.json`.
