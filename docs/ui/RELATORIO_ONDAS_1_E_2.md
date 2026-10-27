# Relatório — Auditoria da Onda 0 + Ondas 1 e 2 (Home pública e moldura autenticada)

Data: 2026-10-27. Branch de trabalho: `feat/ondas-1-2-home-shell` (base `origin/main` = `7f7ba8c`).

## A. Auditoria da Onda 0 em produção

Classificação: **CONFIRMADA EM PRODUÇÃO**.

| Evidência | Resultado |
|---|---|
| PR #42 | `MERGED` em 2026-10-27T11:51:12Z por `bartolomeu7` (merge commit `7f7ba8cec12042e7767714ad52a770d9899f09fb`; pai = `e268814`, commit da Onda 0) |
| Arquivos na `main` | os 8 arquivos da Onda 0 (`globals.css`, `tailwind.config.ts`, `button.tsx`, `badge.tsx`, `app-sidebar.tsx`, teste de tokens e 2 docs) presentes; `--popover` e `--primary-solid` conferidos em `globals.css` da `main` |
| Checks no HEAD da `main` | `verify` = success; status Vercel = success (`dpl_CXsLn7VHqXWBB76ETsyHGTtfbGDv`) |
| Domínio | alias `primeges.com.br` listado no deployment acima; `https://primeges.com.br/` → 200; `http://` → 308 para `https://primeges.com.br/`; canonical `https://primeges.com.br` |
| Conteúdo em produção | o CSS servido por `primeges.com.br` contém `--popover` (6 ocorrências), `primary-solid` (8) e a regra `bg-popover` (1); `<html class="… dark">` |
| Observação | `www.primeges.com.br` não tem certificado válido para o nome (erro de SNI no `curl`) — fora do escopo, só registrado |

## B. Implementação

### Onda 1 — Home pública e navegação pública
- **Bug corrigido (reproduzido antes, validado depois):** no menu mobile, clicar em "Preços" (e nos outros itens) trocava o hash mas **não rolava a página** (scrollY=0, seção a 9.887 px). Causa: o clique do link e o fechamento do Sheet acontecem juntos, com a rolagem travada pelo Radix. Agora o clique marca o destino, fecha o menu e a rolagem é feita depois do fechamento (`onCloseAutoFocus`), respeitando `prefers-reduced-motion`. Detalhe: `preventDefault` também impedia o `SheetClose` de fechar o menu, então o fechamento é explícito.
- Cabeçalho agora é `sticky` e a classe `prime-site-header--scrolled` (que já era aplicada pelo código, mas não tinha regra CSS) ganhou fundo translúcido, desfoque e borda.
- Item ativo do menu desktop ganhou indicador (sublinhado com o token `primary-text`), além de `aria-current`.
- No celular o botão "Criar conta" ficou visível no cabeçalho (antes só dentro do menu), com alvo de toque de 44 px.
- `pricing-card.tsx`: azul fixo `hsl(207 100% 72%)` trocado pelo token `primary-text` (68%; mudança sutil de tom).
- Preservados: textos, preços, seções, links de login/cadastro e legais, SEO/metadata/JSON-LD, headings e IDs de âncora.

### Onda 2 — Moldura autenticada, navegação interna e conta
- **Breadcrumb** no header da empresa (`md+`), no mesmo padrão do header do admin. Lógica pura em `src/components/app/route-labels.ts`: módulo vem de `nav-items.ts`, segmentos conhecidos têm rótulo, identificadores viram "Detalhes" (o id nunca aparece) e só há link para páginas que existem. Um teste compara a lista de rotas com o sistema de arquivos.
- Sidebar: item ativo ganhou peso de fonte e barra indicadora lateral (token `primary-text`); itens, rotas, grupos e `aria-current` inalterados.
- `/conta`: moldura com header fixo e borda, skip link, cartões com a superfície `card`, alvo de toque no "Voltar ao sistema". Guarda de sessão, RPC e `DeleteAccountPanel` intactos.
- Não alterados: Clerk, sessão, empresa/tenant, roles, middleware, Server Actions, `UserMenu`, `AdminShell`.

### Arquivos
Alterados: `src/components/marketing/site-header.tsx`, `src/components/marketing/pricing-card.tsx`, `src/app/globals.css`, `src/components/app/header.tsx`, `src/components/app/app-sidebar.tsx`, `src/app/conta/page.tsx`.
Novos: `src/components/app/route-labels.ts`, `tests/unit/app-breadcrumbs.test.mjs`, `tests/unit/public-shell-ondas-1-2.test.mjs`, este relatório e `docs/ui/RELATORIO_PREVIEW_ONDA_0.md`.
Sem alteração em `package.json`, lockfile, dependências, banco, variáveis, middleware ou rotas.

## C. Qualidade (build com variáveis fictícias de CI)

| Comando | Saída | Resultado |
|---|---|---|
| `npm run test:unit` | 0 | 285 testes, 284 ok, 0 falhas, 1 ignorado (antes: 269; +16 novos) |
| `npm run lint` | 0 | 0 erros, 10 avisos antigos (um erro novo — variável `module` — foi corrigido) |
| `npm run typecheck` | 0 | limpo |
| `npm run build` | 0 | sucesso |
| `npm run test:seo` | 0 | 37/37 (grupo de rotas dinâmicas ignorado: exige `SEO_BASE_URL`) |
| `git diff --check` | 0 | limpo |

Verificação em navegador (Playwright, **Home pré-renderizada servida por um servidor estático local**, sem Clerk/Supabase; o serviço de imagens e as rotas dinâmicas não existem nesse servidor, por isso o logo aparece quebrado e há erros 404 de console que são do servidor de teste):
- Mobile 390 px: menu abre e fecha; "Preços", "Recursos", "Perguntas", "Para quem é" e "Produto" rolam até a seção (posição final = `scroll-margin` de 84 px) e atualizam o hash; sem overflow horizontal; cabeçalho `sticky` em `top: 0` com classe `--scrolled` ao rolar; botão "Criar conta" visível.
- Desktop 1366 px: item ativo "Preços" com sublinhado e `aria-current`.

## Limitações (não verificado)
- **Shell autenticado, breadcrumb, sidebar e `/conta` não foram vistos em navegador**: exigem sessão Clerk + Supabase reais. Cobertos só por testes unitários/estáticos, typecheck e build.
- Contraste medido, navegação por teclado completa e leitor de tela não foram testados em navegador.
- Logo e imagens otimizadas não foram avaliados no servidor estático.
- `www.primeges.com.br` sem certificado válido (preexistente).

---

## D. Go Live (verificado em 2026-10-27, após o merge do PR #43)

**Estado: GO LIVE CONCLUÍDO para a área pública (Home/navegação). Shell autenticado e `/conta` NÃO validados em produção.**

| Item | Evidência |
|---|---|
| PR | [#43](https://github.com/bartolomeu7/saas-project/pull/43) — `MERGED` em 2026-10-27T12:22:00Z, merge commit `15430ba71719c14385d2c3372e279ecacf03a7a6` (feito pelo dono; o merge feito pelo Claude foi negado pelo ambiente, sem contorno) |
| Commit publicado | `15430ba71719c14385d2c3372e279ecacf03a7a6` (`main`); contém `bd49724` (Ondas 1 e 2) sobre `7f7ba8c` (Onda 0) |
| Deployment de produção | `dpl_AeerNhxkqTSJNNybinhwC7j36zqS` — status do commit no Vercel: `success` ("Deployment has completed"); https://vercel.com/juninhormatos-9956s-projects/saas-project/AeerNhxkqTSJNNybinhwC7j36zqS |
| Domínio | alias `primeges.com.br` listado nesse deployment |
| CI pós-merge na `main` | `verify` = success |

### Testes em produção (https://primeges.com.br) — efetivamente executados
- HTTP: `/` 200; `http://` → 308 para `https://primeges.com.br/`; `/login`, `/register`, `/termos-de-uso`, `/politica-de-privacidade`, `/robots.txt`, `/sitemap.xml` → 200; `/app` e `/conta` sem sessão → 307 para `/login?next=…` (guarda funcionando).
- CSS servido: contém `.prime-site-header{…position:sticky…}`, a regra `.prime-site-header--scrolled` e `--popover`; título e canonical `https://primeges.com.br` preservados.
- Navegador (Playwright, produção real), mobile 390 px: cabeçalho `sticky` em `top: 0`; botão "Criar conta" visível (106×44 px); sem overflow horizontal; **menu abre e fecha e os 5 itens (Preços, Recursos, Perguntas, Para quem é, Produto) rolam até a seção** (posição final = 84 px, hash atualizado, menu fechado). O bug de "Preços" está corrigido em produção.
- Navegador, desktop 1366 px: `/#precos` abre na seção; cabeçalho com classe `--scrolled`; item "Preços" com `aria-current`; sem overflow; links de login/cadastro presentes. Sem requisições com falha na Home em produção.

### Não foi possível / não executado
- **Shell autenticado, sidebar (item ativo), breadcrumb e `/conta`**: não há sessão de teste autorizada; não criei contas nem usei credenciais. Só cobertos por testes unitários/estáticos, typecheck, build e CI.
- Contraste medido, navegação por teclado completa e leitor de tela.
- Tooltips/menus/popovers da Onda 0 (ficam no app autenticado).
- Nenhum teste gravou dados; nenhuma variável, segredo, banco, RLS ou Clerk/Supabase foi alterado.

### Problemas remanescentes
- `www.primeges.com.br` sem certificado válido para o nome (preexistente, fora do escopo).
- Validação visual do shell autenticado e de `/conta` pendente: conferir logado — breadcrumb no header (md+), barra indicadora no item ativo da sidebar e a moldura de `/conta`.
