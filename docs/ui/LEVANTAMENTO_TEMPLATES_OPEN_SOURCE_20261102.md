# Levantamento de templates open source para o novo visual do Prime Ges

Data: 2026-11-02. Fonte dos dados: API pública do GitHub (licença, estrelas, último commit e `package.json` lidos agora, um por um). A busca na web não funcionou nesta sessão (erro do serviço de busca), então **nada aqui vem de memória sem conferência**, exceto onde estiver marcado "não verificado".

## 1. O ponto mais importante: a base técnica

| | Prime Ges hoje | Quase todos os templates atuais |
|---|---|---|
| React | 18.3 | 19.x |
| Tailwind | 3.4 | 4.x |
| Zod | 3 | 4 |
| Componentes base | Radix UI | Base UI (Kiranism, ShadcnStore, arhamkhnz, mickasmt, TailAdmin) ou Radix (satnaing, ixartz) |

Consequência: **copiar arquivos inteiros não funciona**. Todos precisam ser adaptados (classes do Tailwind 4, imports, formulários). O caminho viável, já adotado no roadmap, é **copiar padrões visuais e de layout** e reescrevê-los na nossa base. Subir Tailwind/React/Zod seria um projeto separado, e não é necessário para mudar o visual.

## 2. Candidatos verificados (todos com licença MIT, exceto onde indicado)

| Template | Tipo | Estrelas | Último commit | Stack verificado | Serve para |
|---|---|---|---|---|---|
| **shadcn/ui blocks** (`shadcn-ui/ui`) | blocos oficiais: `dashboard-01`, `sidebar-01…16`, `login-01…05`, `signup-01…05` | 127 mil | 02/11/2026 | mesma biblioteca que já usamos | Dashboard, sidebar, login e cadastro. Melhor ponto de partida: mesma família de componentes |
| **ShadcnStore** (`shadcnstore/shadcn-dashboard-landing-template`) | landing page + dashboard + páginas de autenticação | 1,2 mil | 28/10/2026 | Next 16.4, React 19.3, TW 4.3, Base UI | **Home** e dashboard. Já é a referência principal do roadmap |
| **Kiranism** (`Kiranism/next-shadcn-dashboard-starter`) | dashboard com Clerk, tabelas, kanban, gráficos (Recharts) | 7,2 mil | 01/11/2026 | Next 16.4, React 19.3, TW 4.3, Base UI, **Clerk** | Módulos (tabelas, filtros, paginação). Já é a referência da Onda 4. Usa Clerk como nós |
| **satnaing/shadcn-admin** | dashboard admin (Vite, não Next) | 16,4 mil | 10/09/2026 | React 19, TW 4, **18 pacotes Radix** | Padrões de telas admin. É o que usa **Radix**, como nós: menos adaptação nos componentes |
| **arhamkhnz/next-shadcn-admin-dashboard** | dashboard com layouts e temas variados | 3,2 mil | 30/10/2026 | Next 16.4, React 19, TW 4, Base UI | Variações de layout e seletor de tema |
| **ixartz/SaaS-Boilerplate** | landing + dashboard + Clerk | 7,5 mil | 01/11/2026 | Next 16, React 19, TW 4, 5 Radix, **Clerk** | Estrutura de SaaS com Clerk: planos, landing, painel |
| **TailAdmin free** | dashboard admin | 2,6 mil | 29/10/2026 | Next 16, React 19, TW 4 | Visual de admin alternativo |
| **mickasmt/next-saas-stripe-starter** | landing + dashboard SaaS | 3 mil | 28/09/2026 | Next 16, React 19, TW 4 | Landing de SaaS (a parte de pagamento é Stripe, não usamos) |
| **Magic UI** (`magicuidesign/magicui`) | componentes animados para landing | 23 mil | 02/11/2026 | não verificado | Efeitos de landing. Exige biblioteca de animação, ou seja, **dependência nova** (precisa da sua aprovação) |
| Refine (`refinedev/refine`) | framework de painel admin | 36 mil | 10/09/2026 | não verificado | **Não recomendado**: é um framework, implicaria trocar a arquitetura |

## 3. Evitar (licença impede ou exige cuidado)

| Repositório | Motivo |
|---|---|
| `midday-ai/midday` | AGPL-3.0: obriga abrir o código de quem usa |
| `twentyhq/twenty`, `dubinc/dub.link` | GitHub não identifica licença única (indica parte comercial/AGPL): não usar sem ler a licença |
| `cruip/open-react-template`, `vercel/platforms`, `ibelick/nim` | **sem arquivo de licença**: sem licença, o padrão é "todos os direitos reservados". Não copiar |
| `vercel/nextjs-subscription-payments` | arquivado |
| `themesberg/flowbite-admin-dashboard` | parado desde 03/2025 |

Observação: licença MIT permite copiar e modificar, desde que o aviso de copyright seja mantido nos arquivos copiados. Isso deve entrar no PR.

## 4. Recomendação (por área)

| Área | Referência principal | Apoio |
|---|---|---|
| Home / landing | ShadcnStore | ixartz (estrutura de planos/seções), Magic UI (só se você aprovar a dependência) |
| Dashboard da empresa | shadcn/ui `dashboard-01` + ShadcnStore | satnaing (Radix) |
| Sidebar e navegação | shadcn/ui `sidebar-*` (já usamos o componente `sidebar`) | arhamkhnz (opções de layout) |
| Login e cadastro | shadcn/ui `login-*`/`signup-*` como visual do cartão ao redor do Clerk | — |
| Módulos (Clientes, Vendas…) | Kiranism | satnaing |
| Painel admin | satnaing + TailAdmin | Kiranism |

## 5. Limites deste levantamento
- Não executei nem testei nenhum template; li só metadados e `package.json`.
- Templates pagos (ex.: kits comerciais de shadcn) ficaram de fora porque você pediu open source.
- Compatibilidade do shadcn/ui blocks com Tailwind 3.4: **não verificado**. Os blocos atuais estão no formato do Tailwind 4 e precisam de adaptação.
- Estrelas e datas são de hoje (02/11/2026) e mudam.

## 6. Próximo passo sugerido
Escolher o **visual** antes de programar: montar 2 ou 3 páginas de amostra (Home e dashboard) em Preview, uma com cada referência (ShadcnStore, shadcn/ui blocks, satnaing), para você ver e escolher. Depois disso o PR de implementação é rápido e sem retrabalho.
