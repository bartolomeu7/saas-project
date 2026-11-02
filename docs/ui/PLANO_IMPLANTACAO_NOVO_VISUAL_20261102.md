# Plano de implantação do novo visual do Prime Ges

Data: 2026-11-02. Somente planejamento: nenhum código foi alterado. Referências escolhidas pelo dono: **shadcn/ui blocks**, **ShadcnStore**, **Kiranism** e **satnaing/shadcn-admin** (todas MIT, verificadas em `LEVANTAMENTO_TEMPLATES_OPEN_SOURCE_20261102.md`).

## 1. O que o estudo dos templates mostrou (verificado hoje)

| Fato | Evidência | Efeito no plano |
|---|---|---|
| Os 4 templates usam React 19, Tailwind 4 e Zod 4; nós usamos 18.3, 3.4 e 3 | `package.json` de cada um | **Não se copia arquivo.** Reescrevemos os padrões na nossa base (classes, imports, formulários) |
| ShadcnStore (Next) tem: landing com 15 seções (hero, features, stats, pricing, FAQ, CTA, depoimentos, equipe, blog, contato, carrossel de logos), 14 páginas de autenticação e erros, dashboards, `settings/*`, `pricing`, `faqs` | árvore do repositório | Fonte da **Home** e das telas de erro/configuração |
| shadcn/ui `dashboard-01` = sidebar "inset" + cartões de KPI + gráfico de área + tabela de dados; há também `sidebar-01…16`, `login-01…05`, `signup-01…05` | repositório oficial | Fonte do **dashboard, sidebar e visual de login** |
| Kiranism: `data-table/` (cabeçalho de coluna, filtros facetados, paginação, opções de colunas, skeleton), `features/{products,users,overview,kanban}`, usa Clerk | árvore | Fonte dos **módulos** (padrão de toolbar/filtros/tabela) |
| satnaing: `features/{users,tasks,settings,dashboard}` com diálogos de ação/exclusão, ações em massa, tabela com ações por linha; **Radix** | árvore + `package.json` | Fonte do **admin** e dos diálogos |
| Os templates dependem de **`@tanstack/react-table`, `recharts`, `react-hook-form`, `date-fns`, `next-themes`, `nuqs`, `motion`**. **Nenhuma está no nosso `package.json`** | comparação de `package.json` | Regra "sem dependência nova" muda o jeito de implementar (ver D1–D3) |
| Nossas tabelas já são **dirigidas pelo servidor** (filtros por GET, `pagination`, componentes próprios por módulo) | `components/app/*-table.tsx`, `*-filters.tsx` | Não precisamos de TanStack Table: só do **visual** do Kiranism |
| Já existe gráfico **sem biblioteca**: `components/admin/admin-charts.tsx` (`BarChart`, `BreakdownBars` em CSS) | arquivo | Dá para ter gráficos no dashboard sem `recharts` |
| `getReportsWorkspace` já agrupa vendas por dia (`dayKey`/`dayLabel`) | `lib/reports/queries.ts` | Série histórica do dashboard pode **reaproveitar a consulta existente**, sem migration |
| `components/ui` tem 30 componentes (inclui `sidebar`, `sheet`, `command`, `breadcrumb`, `table`, `tabs`). Faltam: `calendar`, `form`, `toggle`, `pagination`, `chart` | listagem | Só criar o que a onda realmente usar, sem dependência |
| Tema escuro fixo (`<html class="dark">`), sem `next-themes` | auditoria de 26/10 | Tema claro/escuro é decisão separada (D3) |
| Etapas já feitas: Onda 0 (tokens), 1–2 (cabeçalho público, breadcrumb, sidebar ativa), Home parcial, login e dashboard reorganizados | PRs #42–#47, no ar | O plano continua dali; não refaz o que já está em produção |

## 2. Decisões que dependem do dono

| # | Decisão | Recomendação | Se não decidir |
|---|---|---|---|
| D1 | **Gráficos** do dashboard: usar o `BarChart` em CSS que já temos, ou adicionar `recharts` | **CSS próprio** (sem dependência) na primeira entrega; `recharts` só se você quiser gráficos de área/pizza interativos | Fico com CSS |
| D2 | Adicionar **qualquer** dependência nova (`recharts`, `motion`, `next-themes`, `react-hook-form`) | Nenhuma por enquanto | Nenhuma |
| D3 | **Tema claro/escuro** para os usuários | Adiar: manter escuro até as ondas visuais terminarem (os tokens claros nunca foram validados) | Adiado |
| D4 | **Sessão de teste** para validar telas logadas (dashboard, módulos, admin) | Conta de teste somente leitura, ou me autorizar a rodar o app localmente apontando para o banco de TESTE (hoje o acesso a ele está dando erro de senha e precisa ser corrigido por você) | As ondas 2, 4 e 5 ficam **sem validação logada** e serão marcadas BLOCKED |
| D5 | **Dados da empresa** (razão social, CNPJ, e-mail do encarregado) para tirar os "[BLOCKED]" das páginas legais | Você informa; publico em PR separado | Continuam marcados |
| D6 | **Conteúdo real** para seções de prova social (depoimentos, logos de clientes, números de uso) | Só entram se forem reais; **não vou inventar** | Seções omitidas |

## 3. Regras fixas (valem para todas as ondas)

1. Manter Radix, Tailwind 3.4, React 18.3, Zod 3, Clerk, Supabase, EvoPay. Sem migração de stack.
2. Nenhuma mudança em banco, RLS, middleware, guards, Server Actions, rotas, billing, variáveis ou domínio. Só apresentação.
3. Sem dados inventados: gráficos e números só com dados reais; onde não houver dado, estado vazio honesto.
4. Cada onda = 1 a 2 PRs pequenos. Você mescla. Eu não mesclo.
5. Pós-deploy obrigatório (a lição da última auditoria): depois de cada merge eu confiro **em produção** o commit visível no rodapé (já existe) e capturo antes × depois, e te mando o resultado.
6. Cada PR: lint, typecheck, testes, build e `git diff --check` limpos, com os mesmos testes estáticos de regressão que já temos.
7. Licença: arquivo `THIRD_PARTY_NOTICES.md` com o aviso MIT de cada referência de onde algum trecho for adaptado (exigência da licença).
8. Responsividade conferida em 390, 768 e 1366 px, e navegação por teclado nos componentes novos.

## 4. Ondas

### Onda A — Preparação (1 PR, sem mudança visual)
- `THIRD_PARTY_NOTICES.md`.
- Script de captura antes × depois (Playwright, sem dependência de projeto) e baseline das telas públicas.
- Teste estático novo que trava o que não pode mudar (guards, rotas, Clerk fora das páginas públicas).
- **Pronto quando:** CI verde e baseline salvo.

### Onda B — Home completa (ShadcnStore) — 2 PRs
Hoje já mudaram: hero, Problema, FAQ, faixas, planos. Faltam:

| Seção da nossa Home | Padrão do ShadcnStore | Observação |
|---|---|---|
| Funcionalidades | `features-section` (grade tipo bento com ícone, título e prévia) | conteúdo = nossos módulos reais |
| Para quem é (segmentos) | cartões com destaque por segmento | texto atual mantido |
| Diferenciais | `stats-section` / blocos de benefício | **sem números inventados**; só afirmações verificáveis do produto |
| CTA final | `cta-section` com fundo em gradiente | mesmo link de cadastro |
| Rodapé | `footer` em colunas | links e versão (commit) preservados |
| Depoimentos, equipe, blog, contato, logos | **omitidos** | sem conteúdo real (D6) |

- PR B1: Funcionalidades + Segmentos. PR B2: Diferenciais + CTA + rodapé.
- **Pronto quando:** diferença medida (pixel-diff) nas seções alteradas, sem rolagem horizontal em 390 px, SEO/JSON-LD/ISR intactos, `test:seo` 37/37.

### Onda C — Login e cadastro (shadcn `login-*`/`signup-*`) — 1 PR
- Moldura visual (duas colunas, painel de benefícios) em volta do `<SignIn/>`/`<SignUp/>` do Clerk; fluxo do Clerk e etapa de aceite de termos **intactos**.
- **Pronto quando:** rótulos completos, foco discreto, contraste AA nos textos novos, sem regressão no teste de escopo do Clerk.

### Onda D — Shell e dashboard (shadcn `dashboard-01` + `sidebar-*`) — 2 PRs
- D1: sidebar em variante "inset" (cabeçalho com breadcrumb e busca já existentes), grupos e estados ativos refinados.
- D2: dashboard: cartões de KPI no padrão `section-cards` (dados reais atuais), **gráfico de vendas por dia** reaproveitando `getReportsWorkspace` (D1: gráfico em CSS), lista de vendas recentes.
- **Dependência:** validação logada (D4). Sem ela, entrego com a mesma ressalva de antes (layout validado só em cópia com valores sintéticos, **marcado BLOCKED**).
- **Pronto quando:** mesmas consultas e intervalos, estado vazio honesto quando não há vendas, responsivo.

### Onda E — Módulos (Kiranism) — piloto + lotes
- Piloto **Clientes**: toolbar (busca + filtros em popover/facetados), paginação, ações por linha, skeleton e estado vazio. Mantém filtros por GET, Server Actions e permissões.
- Depois, em lotes (1 PR cada): Produtos/Serviços → Vendas → Estoque/Compras/Fornecedores → Caixa/Financeiro → Agenda/Equipe/Fidelidade → Relatórios.
- Cria 1 a 2 componentes compartilhados (toolbar de filtros e cabeçalho de página) para evitar copiar o mesmo padrão em 12 módulos; remove CSS `prime-module-page--*` correspondente só quando o módulo migrar.
- **Pronto quando (por módulo):** mesma funcionalidade, mesmos testes, captura antes × depois, sem regressão de permissão.

### Onda F — Painel admin (satnaing) — 3 PRs
- Shell do admin e `/admin` (dashboard) → listas (usuários, empresas, planos) → assinaturas/pagamentos/auditoria/ferramentas/configurações.
- Diálogos de ação e exclusão no padrão do satnaing, **mantendo** `requirePlatformAdmin`, `requireSuperAdmin` e as 26 Server Actions.
- **Pronto quando:** guards e rotas inalterados (teste estático), diálogos com foco e Escape corretos.

### Onda G — Regressão final — 1 PR
- Passada de responsividade, teclado, contraste, estados vazios/erro; limpeza do CSS legado já substituído; atualizar README e documentação.

## 5. Ordem e dependências

A → B → C → D → E (piloto) → E (lotes) → F → G. As ondas B e C podem ser feitas sem sessão logada. **D, E e F dependem da decisão D4** para serem validadas de verdade.

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Mudar layout compartilhado quebra várias telas | PRs pequenos, baseline visual e teste estático por onda |
| CSS legado (`globals.css` 3 mil linhas, `home-v2.css` 1,8 mil) concorrendo com classes novas | migrar por módulo e remover regra velha no mesmo PR; ordem de cascata verificada |
| Parecer pronto sem estar | pós-deploy obrigatório com commit no rodapé e capturas em produção |
| Telas logadas sem validação | marcar BLOCKED explicitamente; não declarar a onda concluída |
| Licença | só MIT; aviso em `THIRD_PARTY_NOTICES.md` |
| Escopo crescer para troca de stack | proibido pelas regras fixas; qualquer upgrade (Tailwind 4/React 19) vira projeto separado |

## 7. Como medimos "mudou de verdade"
- Pixel-diff por seção contra a versão anterior em produção, com limite mínimo definido por onda (para a Home, as seções alteradas devem diferir de forma visível, não ≈ 0 %).
- Captura em 390 / 768 / 1366 px, antes × depois, anexada ao PR e ao relatório da onda.
- Verificação em `primeges.com.br` pelo commit visível no rodapé.
