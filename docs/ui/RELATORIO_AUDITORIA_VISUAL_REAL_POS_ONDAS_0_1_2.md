# Auditoria visual real — Prime Ges pós Ondas 0, 1 e 2

Data: 2026-10-27. Navegador: Chromium (Playwright), zoom 100 %, fontes carregadas (`document.fonts.ready`), viewports **desktop 1366 × 900** e **mobile 390 × 844**. Evidências: `docs/ui/evidencias-auditoria-visual-20261027/`.

## 1. Conclusão executiva

- **A percepção do proprietário foi CONFIRMADA para a Home, o login, o dashboard e o admin.** Medido, não opinado:
  - **Home:** comparei a Home de antes (commit `709817b`) com a atual (`main`, `2e67185`), ambas construídas e capturadas no mesmo navegador, mesmas dimensões, mesmos pontos de rolagem. Fora da faixa do cabeçalho, as capturas são **pixel a pixel idênticas** (diferença de 0 % em 9 das 10 capturas e 0,003 % na restante — ver `compare_body_results.json`). O que muda é só o cabeçalho (fixo ao rolar, indicador do item ativo no desktop, botão "Criar conta" visível no celular) e uma linha de borda de 1 px quando rolado.
  - **Login, dashboard e admin:** `git diff 709817b origin/main` **não altera nenhum arquivo** de login, `components/shared/auth`, `components/clerk`, `app/admin` nem da página do dashboard. Visualmente são iguais por construção.
- **A produção serve o código esperado.** O alias `primeges.com.br` está no deployment do commit `2e67185` (status Vercel `success`); o CSS servido tem o cabeçalho `sticky`, a regra `--scrolled` e `--popover`; a Home de produção é visualmente igual à Home "depois" construída localmente (mesma estrutura, mesmo hero).
- **O que faltou:** as Ondas 1 e 2 foram entregues como **ajustes de navegação e moldura**, não como redesenho da composição. O objetivo "melhorar hierarquia, tipografia, espaçamento, seções e cards da Home" **não foi realizado** — nenhuma dessas partes mudou. As Ondas 0 (tokens) e 2 (shell/`/conta`) não têm efeito visível na Home/login e não puderam ser vistas logadas (sem sessão autorizada).
- O resultado da auditoria é, portanto: o Prime Ges **não mudou de forma perceptível** em relação à versão antiga, exceto o cabeçalho da Home e o CTA mobile. Isso não é falha de testes (eles testam outra coisa): é o escopo que foi implementado.

## 2. Matriz por página

| Página | Antes (evidência) | Depois (commit / deployment) | Viewport | Mudanças observadas | Impacto visual | Teste visual em produção |
|---|---|---|---|---|---|---|
| Home `/` (corpo) | build local de `709817b`, servido estático; 12 capturas | build local de `2e67185` + captura de produção real (`primeges.com.br`, deployment do `2e67185`) | desktop e mobile | corpo idêntico (diff 0–0,003 %) | **NENHUM** | PASS (capturada); sem mudança a provar |
| Home — cabeçalho/navegação | idem | idem | desktop e mobile | cabeçalho passa de `relative` (some ao rolar) para `sticky`; sublinhado no item ativo; "Criar conta" visível no celular; menu mobile agora rola até a seção | **BAIXO** (perceptível ao rolar, mas a página inteira continua igual) | PASS (5 itens do menu mobile testados em produção) |
| Login `/login` | sem captura "antes" (exige Clerk); evidência: diff de código sem alterações | produção `primeges.com.br/login` (captura) | desktop e mobile | nenhuma | **NENHUM** (inferido por diff; certeza reduzida por não haver captura antes) | PASS (capturada; é a versão atual) |
| Dashboard `/app` | não capturável | `/app` redireciona para `/login?next=/app` sem sessão | — | arquivo da página não alterado; só efeitos indiretos do tema | **NÃO VERIFICADO** (código: NENHUM) | **BLOCKED** (sem sessão autorizada) |
| Admin `/admin` | não capturável | idem | — | `app/admin` não alterado | **NÃO VERIFICADO** (código: NENHUM) | **BLOCKED** |
| Shell autenticado (sidebar, header, breadcrumb) | não capturável | idem | — | código: item ativo com barra, breadcrumb, `font-medium` | **NÃO VERIFICADO** | **BLOCKED** |
| `/conta` | não capturável | idem | — | código: header fixo, skip link, cartões | **NÃO VERIFICADO** | **BLOCKED** |

## 3. Antes × depois (arquivos)

Pasta: `docs/ui/evidencias-auditoria-visual-20261027/`.
- `before_home_<desktop|mobile>_<topo|recursos|produto|segmentos|precos|faq>.png` e `before_home_mobile_menu_open.png` — Home em `709817b`.
- `after_home_…` — Home em `2e67185`.
- `cmp_home_…` — lado a lado: **antes | depois | diferença** (vermelho = pixel diferente).
- `prod_home_…` e `prod_login_<desktop|mobile>.png` — produção real, capturada em 2026-10-27 ~12:37 UTC.
- `compare_results.json` (imagem inteira) e `compare_body_results.json` (excluindo os 70 px do cabeçalho).

Limitações do método: "antes" e "depois" foram construídos localmente (`npm run build` com variáveis fictícias de CI) e servidos como HTML pré-renderizado estático, porque o Clerk não funciona com chaves fictícias. Por isso, nessas capturas a seção de preços mostra "planos indisponíveis" (sem banco) — para preços reais use `prod_home_*`. Não existem capturas históricas da produção anterior; a versão antiga foi reconstruída do commit `709817b`, que era a produção imediatamente antes da Onda 0.

Elementos visivelmente diferentes (e só estes): cabeçalho fixo com fundo translúcido e borda ao rolar; sublinhado azul no item ativo (desktop); botão "Criar conta" ao lado do menu no celular. O `cmp_home_mobile_topo.png` mostra que o hero é o mesmo (a diferença vermelha no texto é só o deslocamento de 1 px da borda do cabeçalho).

## 4. Ondas 0, 1 e 2 — pretendido × observado

**Onda 0 (tokens)** — `globals.css`, `tailwind.config.ts`, `button.tsx`, `badge.tsx`, `app-sidebar.tsx`. Pretendido: nomear azuis e definir `--popover`. Observado: tokens presentes no CSS de produção (`--popover`, `primary-solid`; regra `bg-popover`); **efeito visual na Home/login: nenhum**, como projetado (mesmos valores). Dropdown/select/tooltip/command (`bg-popover`) **não foram vistos**: só existem no app logado (BLOCKED). Fundação ≠ redesign.

**Onda 1 (Home/nav)** — `site-header.tsx`, `pricing-card.tsx`, `globals.css`. Comprovado em produção: header `sticky`; menu mobile com os 5 itens rolando até a seção e fechando; CTA mobile (106 × 44 px); sublinhado do item ativo no desktop; sem overflow horizontal; links de login/cadastro presentes. **Não comprovado/não feito:** mudança de hierarquia, hero, tipografia, espaçamento, seções e cards (corpo idêntico).

**Onda 2 (shell/conta)** — `header.tsx`, `route-labels.ts`, `app-sidebar.tsx`, `conta/page.tsx`. Cobertos por testes unitários/estáticos, typecheck, build e CI; **nenhum critério visual comprovado** (BLOCKED, sem sessão).

## 5. Produção

| Evidência | Resultado |
|---|---|
| Código mergeado | PR #42 (`7f7ba8c`), #43 (`15430ba`), #44 (`2e67185`, só docs); `main` = `2e67185579c10722856bec7c4e6a914d1e85fbdd` |
| Deploy concluído | status Vercel do commit `2e67185` = success (`dpl_C45467tn823shDec6nmS6qF2KaN2`) |
| Domínio | alias `primeges.com.br` listado nesse deployment |
| Página acessada | `https://primeges.com.br/` e `/login` → 200 (capturas) |
| Visualmente comparada | Home (corpo e cabeçalho) sim; login só a versão atual; telas logadas não |
Cache/CDN: a Home em produção já traz o CSS novo (`prime-site-header{position:sticky}`), então não há indício de cache antigo ou deployment errado.

## 6. Testes

| Teste | Resultado |
|---|---|
| `npm run test:unit` | PASS — 286 testes, 285 ok, 0 falhas, 1 ignorado (preexistente) |
| `npm run lint` | PASS — 0 erros, 10 avisos antigos |
| `npm run typecheck` | PASS |
| `npm run build` (env fictício de CI) | PASS |
| `npm run test:seo` | PASS — 37/37 (grupo dinâmico ignorado sem `SEO_BASE_URL`) |
| `git diff --check` | PASS |
| Menu mobile (5 âncoras) em produção | PASS |
| Home desktop/mobile em produção (sem overflow, sticky) | PASS |
| Login capturado em produção | PASS (render); ver defeito na seção 7 |
| Telas autenticadas, dropdown/select/tooltip/command, teclado, contraste medido | **BLOCKED** (sem sessão de teste autorizada; nenhuma credencial usada) |
| E2E automatizado | NOT IN SCOPE (o repositório não tem E2E configurado) |

## 7. Correções feitas nesta missão

Achado concreto durante a auditoria (medido em produção): nos cartões de preço, o plano sem selo ("Trimestral") tem o nome do plano a **25 px** do topo do cartão enquanto os demais têm **58 px** — preços desalinhados por 33 px na linha de planos.
- Hipótese/correção: reservar a faixa do selo em todos os cartões (`pricing-card.tsx`, contêiner sempre presente com `min-h` de 22 px; o selo mede 20,5 px).
- Teste novo em `tests/unit/public-shell-ondas-1-2.test.mjs`.
- **Estado: local, branch `fix/auditoria-visual-pricing-alinhamento`; não mesclada, não publicada.** Não foi possível ver o resultado em navegador porque os planos vêm do banco (a build local não os tem); a verificação visual fica para depois do deploy (medir de novo o deslocamento do nome do plano).
- Foi uma correção pequena, deliberadamente: não há redesenho da Home aqui.

Defeito visual encontrado fora de escopo (não corrigido): na página de login em produção o rótulo "Seu e-mail" aparece cortado à esquerda ("ɔeu e-mail") e o campo tem um anel de foco azul muito espesso (`prod_login_desktop.png`). Pertence à aparência do Clerk (`clerk-auth-appearance.ts`).

## 8. Próxima etapa recomendada (escopos separados, nenhum iniciado)

1. **Home — composição (maior impacto percebido):** redesenho de hero, ritmo entre seções (bandas `bg-card/30` hoje quase invisíveis), cards e prova social **sem conteúdo inventado**. Aceite: comparação antes×depois com diferença material no corpo (não só no cabeçalho), `test:seo` e âncoras intactos.
2. **Login:** corrigir o rótulo cortado e o foco; moldura e hierarquia do painel direito. Aceite: captura antes×depois; sem alterar fluxo Clerk.
3. **Dashboard:** hierarquia e cartões (selo estático "Operação online" e histórico placeholder já listados na auditoria anterior); exige sessão de teste autorizada para validação.
4. **Admin:** só depois dos anteriores; sessão super-admin de teste autorizada.
5. Para qualquer validação logada: autorizar uma conta/dataset de teste somente leitura.
6. Issue separada, sem relação com o aspecto visual: `www.primeges.com.br` sem certificado válido para o nome.

## 9. Resumo de uma linha

`AUDITORIA REPROVOU A EXPECTATIVA VISUAL — o corpo da Home é pixel-idêntico ao anterior e login/dashboard/admin não foram alterados; só o cabeçalho/nav da Home mudou; o shell autenticado e a /conta não puderam ser vistos (BLOCKED).`
