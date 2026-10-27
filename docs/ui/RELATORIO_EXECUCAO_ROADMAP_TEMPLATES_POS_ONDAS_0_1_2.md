# Execução do roadmap de fusão de templates — Home, login e dashboard

Data: 2026-10-27. Branch de trabalho: `feat/roadmap-home-login-dashboard` (parte de `fix/auditoria-visual-pricing-alinhamento`, PR #45, que já tem checks verdes; base `origin/main` = `2e67185`). Evidências: `docs/ui/evidencias-roadmap-20261027/`.

## 1. Resumo executivo

- O plano original foi mantido (Onda 1 → 2 → 3, referência principal ShadcnStore; Kiranism para as Ondas 4/5). Nenhum plano novo foi inventado.
- **Entrega A (Home):** a composição da Home mudou de verdade. Na comparação com o commit `709817b` as capturas deixaram de ser idênticas: **8–11 % dos pixels diferem nas seções do desktop e 15–19 % no celular; 28,5 % no topo do desktop** (antes: 0–0,003 % fora do cabeçalho). Hero centralizado com o painel do produto em largura total, Problema e FAQ em duas colunas, faixas de seção com gradiente, títulos maiores, números dos passos em círculo.
- **Entrega B (login):** causa do rótulo "Seu e-mail" cortado encontrada e medida (Clerk deixa `cl-cardBox` com `overflow: hidden` e `cl-card` com `margin-left: -1px`); corrigida em `clerk-auth-appearance.ts`. **A correção só foi demonstrada por emulação do mesmo CSS na produção atual; a prova real depende do deploy.**
- **Entrega C (dashboard):** nova hierarquia (atalhos no topo, alertas em largura total, "Primeiros passos" só enquanto há etapa pendente, números duplicados removidos, textos de 9–11 px elevados para 12–14 px, selo "Operação online" e linha do tempo placeholder removidos). **Só foi renderizado com valores sintéticos, em cópia descartável, porque não há sessão de teste autorizada: validação autenticada BLOCKED.**
- **Nada foi publicado.** Está tudo em branch/PR; falta merge e deploy.
- Ondas 4, 5 e 6 **não foram executadas**.

## 2. Git

- Início: branch `fix/auditoria-visual-pricing-alinhamento` @ `181388a` (PR #45 aberto, `verify` e Vercel verdes, mergeável), `origin/main` = `2e67185`; arquivos não rastreados preexistentes preservados.
- Fim: branch `feat/roadmap-home-login-dashboard` com as alterações abaixo (commit descrito no PR). Sem comandos destrutivos.

## 3. Arquivos alterados

**A — Home (Onda 1):** `src/app/(public)/page.tsx` (Problema e FAQ em duas colunas, faixas, número dos passos), `src/app/home-v2.css` (hero centralizado, painel largo, faixa `home-v3-band`), `src/components/marketing/section-heading.tsx` (escala dos títulos), `src/components/marketing/pricing-card.tsx` (destaque do plano popular; faixa do selo reservada — vem do PR #45), `src/components/marketing/site-header.tsx` (o item ativo não fica "preso" fora das seções).
**B — Login:** `src/components/shared/auth/clerk-auth-appearance.ts`.
**C — Dashboard (Onda 3):** `src/app/(app)/app/page.tsx`, `src/app/globals.css` (bloco `.prime-dashboard`).
**Testes:** `tests/unit/roadmap-home-login-dashboard.test.mjs` (novo), `tests/unit/public-shell-ondas-1-2.test.mjs` (ajuste da regra de HSL fixo).
Sem alteração em `package.json`, lockfile, dependências, middleware, rotas, queries, Server Actions, banco ou variáveis.

## 4. Padrão de referência × problema × adaptação

| Área | Problema anterior (medido) | Padrão (ShadcnStore) adaptado | Resultado esperado |
|---|---|---|---|
| Hero | duas colunas; painel do produto espremido à direita; corpo da Home idêntico ao antigo | hero centralizado + painel do produto largo logo abaixo com esmaecimento para a próxima seção | primeira dobra com título dominante e produto em destaque |
| Títulos de seção | `text-3xl`/`text-base`, pouca hierarquia | tipografia maior, `text-balance` | hierarquia mais clara |
| Problema | três cartões iguais em fila | título à esquerda (fixo ao rolar) + cartões empilhados à direita | leitura em duas colunas |
| FAQ | accordion estreito no centro | título à esquerda + accordion largo à direita | uso do espaço no desktop |
| Faixas de seção | `bg-card/30` quase invisível | gradiente `home-v3-band` | ritmo visível entre blocos |
| Passos | número pequeno | número em círculo | passos mais claros |
| Preço | plano popular só com borda; plano sem selo desalinhado | destaque com halo e leve elevação; faixa do selo reservada | planos alinhados e destaque do popular |
| Dashboard | atalhos soltos no meio; números repetidos (vendas/faturamento nos KPIs e no desempenho); texto de 9–11 px; selo "Operação online" fixo; "Histórico recente" placeholder | cabeçalho de página com ações; KPIs maiores; menos repetição | hierarquia: saudação+atalhos → KPIs → alertas → desempenho → clientes |

Decisões justificadas: o selo "Operação online" não mede estado real (era HTML fixo) e foi trocado pela **data de hoje**, que é dado real; a linha do tempo era uma promessa sem recurso e foi removida; o aviso do gráfico foi reescrito como fato ("ainda não há gráfico histórico"); nenhum gráfico ou métrica foi inventado.

## 5. Matriz por página

| Página | Baseline | Versão atual | Viewport | Diferenças | Impacto visual | Validação |
|---|---|---|---|---|---|---|
| Home (corpo) | build local de `709817b`, HTML pré-renderizado | build local desta branch | 1366×900, 390×844 | hero, seções, faixas, tipografia (ver §4) | **ALTO** no topo (28,5 %/23,5 % dos pixels), **MODERADO** nas demais | capturado; preços reais **BLOCKED** (build local não tem o banco) |
| Login | produção (captura real) | emulação do CSS na produção | 1366×900, 390×844 | rótulo completo; foco discreto; rodapé sem faixa | **BAIXO/MODERADO** (correção de defeito) | emulação PASS; prova real pendente de deploy |
| Dashboard | cópia descartável de `709817b` + stubs sintéticos | cópia descartável desta branch + os mesmos stubs | 1366×900, 390×844 | ver §4 (altura 1.328 → 1.146 px no desktop; 2.669 → 2.262 px no celular) | **ALTO** na composição | layout apenas, **valores sintéticos**; sessão real BLOCKED |
| Shell/sidebar/`/conta` | — | — | — | não alterados nesta missão | NÃO VERIFICADO | BLOCKED (sem sessão) |

## 6. Capturas (em `docs/ui/evidencias-roadmap-20261027/`)

- Home: `before_home_*` (709817b), `after_home_*` (desta branch, 18 + 4), `cmp_home_*` (antes | depois | diferença), `compare_results.json`.
- Login: `login_before_focus_{desktop,mobile}.png` (produção real) e `login_emulated_after_focus_{desktop,mobile}.png` (mesmo CSS injetado).
- Dashboard: `dash_before_*` e `dash_after_*` (topo e meio, desktop e mobile). Cada imagem tem um aviso "SIMULAÇÃO DE LAYOUT — valores sintéticos".
Limites: "antes" da Home é a reconstrução local do commit antigo, não a produção histórica. Capturas feitas no mesmo navegador (Chromium/Playwright), zoom 100 %, fontes carregadas.

## 7. Defeitos encontrados e corrigidos

1. Login: rótulo cortado + anel de foco pesado (causa: `overflow: hidden` do `cl-cardBox` do Clerk e margem de −1 px do `cl-card`; ring de 4 px cortado nas laterais). Corrigido no `appearance`.
2. Preços: plano sem selo com o nome 33 px acima dos demais (PR #45, incluído).
3. Cabeçalho da Home: item de menu "preso" ao voltar ao topo — corrigido e verificado no navegador.
4. Dashboard: textos de 9–11 px, números repetidos, selo/placeholder enganosos — tratados (§4).

## 8. Testes técnicos (variáveis fictícias de CI)

| Comando | Resultado |
|---|---|
| `npm run test:unit` | PASS — 297 testes, 296 ok, 0 falhas, 1 ignorado preexistente |
| `npm run lint` | PASS — 0 erros, 10 avisos antigos |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:seo` | PASS — 37/37 (grupo dinâmico ignorado sem `SEO_BASE_URL`) |
| `git diff --check` | PASS |
| Navegador (Playwright) — Home | PASS: sem overflow; menu mobile com 5 âncoras (destino a 84 px, menu fecha); item ativo limpo no hero |
| Navegador — login (emulação), dashboard (sintético) | executado, ver ressalvas acima |
| Navegador — telas autenticadas reais, dropdown/select/tooltip, teclado, contraste | **BLOCKED** (sem sessão autorizada) |

## 9. Produção/deploy

Nada desta missão foi publicado: depende do merge do PR e do deploy do Vercel. Estado de produção antes desta missão: `main` `2e67185`, deployment `dpl_C45467tn823shDec6nmS6qF2KaN2`.

## 10. Bloqueios

- Merge: o ambiente nega merge feito pelo Claude; o proprietário precisa mesclar. Próxima ação: mesclar o PR desta branch (o PR #45 fica redundante).
- Validação autenticada (dashboard real, shell, `/conta`, overlays): exige uma conta de teste somente leitura autorizada.
- Preços reais na Home e login com o novo `appearance`: só verificáveis em produção após o deploy.

## 11. Roadmap pendente

- **Onda 4:** piloto Clientes (toolbar/busca/filtros/tabela/paginação, padrão Kiranism), depois Produtos/Serviços/Vendas e demais módulos, em lotes — **não iniciada**.
- **Onda 5:** painel admin (preservando guards, diálogos e RPCs) — **não iniciada**.
- **Onda 6:** regressão final (responsividade, acessibilidade, teclado, contraste, E2E/visual) — **não iniciada**; o repositório ainda não tem E2E/visual configurado.
- Fora do que foi feito na Home: header/footer só tiveram ajustes de comportamento; Segmentos, Diferenciais, Funcionalidades e CTA final permaneceram como estavam.

## 12. Preservação

Clerk (SignIn/SignUp, fluxo, redirects), banco, RLS/RPC, billing/EvoPay, rotas, SEO/JSON-LD/ISR, preços reais, variáveis e dados: **não alterados**. Sem dependências novas; sem migração de stack.

## 13. Conclusão

`EXECUÇÃO PARCIAL — Home com mudança material comprovada por capturas (local); correção do login demonstrada por emulação; dashboard reorganizado e renderizado só com valores sintéticos; nada publicado; Ondas 4–6 pendentes.`
