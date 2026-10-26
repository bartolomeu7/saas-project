# Etapa 6 — Escopo do ClerkProvider (relatório)

**Status: IMPLEMENTADA E VALIDADA LOCALMENTE; TESTE AUTENTICADO REAL PENDENTE.**
Não está validada para produção. Nada foi enviado ao remoto, mesclado ou publicado.

Sem segredos neste documento. Medições de laboratório local, não são dados de usuários reais.

## 1. Resumo executivo

O `ClerkProvider` saiu do layout raiz e passou a ficar só nas rotas que usam o Clerk no navegador (ou que dependem do clerk-js para renovar a sessão). A home e as páginas legais estáticas deixam de carregar o clerk-js e o pacote de interface do Clerk.

Reproduzido agora, com a mesma ferramenta, build de produção e perfis nos dois lados, medições intercaladas (3 rodadas, n=15 por lado na home):

| Home, celular 390 px, Slow 4G, CPU 4× | Base (main `fa05032`) | Etapa 6 | Diferença |
|---|---|---|---|
| LCP (mediana) | 2904 ms | 2120 ms | −784 ms (−27,0 %) |
| FCP (mediana) | 1424 ms | 1192 ms | −232 ms (−16,3 %) |
| JS transferido (CDP) | 588,8 KB | 199,6 KB | −389,2 KB (−66,1 %) |
| Bytes totais | 751,1 KB | 320,9 KB | −57,3 % |
| Requisições | 39 | 27 | −12 |
| Terceiros (Clerk) | 8 req / 348,9 KB | 0 | −100 % |
| TBT de laboratório (não é INP) | 255 ms | 193 ms | −24,3 % |
| CLS | 0 | 0 | — |

Os números de −66 % de JS e −27 % de LCP citados antes foram **reproduzidos** nestas condições. As faixas de LCP não se sobrepõem (base 2872–2960 ms; Etapa 6 1960–2232 ms).

O que NÃO foi validado: qualquer fluxo com sessão real (login → `/app`, módulos, conta, sair, `/admin`). Veja a seção 7.

## 2. Estado Git

- Repositório `bartolomeu7/saas-project`, worktree `saas-project-fase3`.
- Início: branch `feat/seo-etapa-1` em `53e349b` (já mesclada), working tree limpo exceto arquivos não rastreados preexistentes (`.playwright-mcp/`, `.serena/`, `docs/AUDITORIA_GO_LIVE_2026-10-18_a_21.md`, `supabase/candidates/`), preservados e NÃO incluídos.
- `origin/main` = `fa05032` (contém o release SEO). A branch `perf/etapa-6-clerk-scope` estava em `b03a690`, com base `5aa32cf` (antes do release).
- Integração não destrutiva: referência de segurança `perf/etapa-6-clerk-scope-backup` → `b03a690`; depois `git merge origin/main` na branch da Etapa 6 → merge commit local `cfc6f73`. Nenhum reset, rebase ou reescrita de histórico. Nada foi enviado ao remoto.
- Diff da Etapa 6 sobre a `main` publicada: 12 arquivos (seção 4) + os desta rodada (testes e docs).

## 3. Arquitetura antes/depois

Antes: `src/app/layout.tsx` envolvia `<html>` em `ClerkAppProvider` (`ClerkProvider` com `localization={ptBR}`), para todas as rotas.

Depois: o layout raiz não tem provider. Ele fica em:

| Local | Rotas cobertas | Por quê |
|---|---|---|
| `(public)/login/layout.tsx` | `/login` | `<SignIn/>` (cliente) |
| `(public)/register/layout.tsx` | `/register` | `<SignUp/>` (cliente) |
| `onboarding/layout.tsx` | `/onboarding` | sessão autenticada (clerk-js renova o token da sessão); sem hook próprio |
| `aceite-termos/layout.tsx` | `/aceite-termos` | idem (server actions com sessão) |
| `acesso-indisponivel/layout.tsx` | `/acesso-indisponivel` | `SignOutButton` (`useClerk`) |
| `acesso-sessoes/layout.tsx` | `/acesso-sessoes` | importa o `SignOutButton` (`useClerk`) |
| `conta/layout.tsx` | `/conta` | `DeleteAccountPanel` (`useClerk`) |
| `(app)/layout.tsx` | `/app/**` | `UserMenu` (`useClerk`) nas sidebars |
| `admin/layout.tsx` | `/admin/**` | `UserMenu` (`useClerk`) |

Sem provider (de propósito): `/`, `/termos-de-uso`, `/politica-de-privacidade`, `/politica-de-reembolso`, `/direitos-do-titular`, `/conta-excluida`.

Solução escolhida (menor alteração): um componente `ClerkSegmentLayout` reaproveitando `ClerkAppProvider`, e layouts de uma linha por segmento. Alternativa descartada: mover pastas para um route group novo (quebraria vários testes que leem caminhos de arquivo e mudaria muita coisa). Padrão de provider em sub-layout é o documentado pela Clerk.

O middleware (`clerkMiddleware`, matcher, rotas protegidas, redirects) NÃO foi alterado: a autenticação e a autorização do servidor não dependem do provider.

## 4. Arquivos alterados (Etapa 6)

| Arquivo | Mudança |
|---|---|
| `src/app/layout.tsx` | remove `ClerkAppProvider` do layout raiz |
| `src/components/clerk/clerk-app-provider.tsx` | documentação do escopo + `ClerkSegmentLayout` |
| `src/app/(app)/layout.tsx`, `src/app/admin/layout.tsx` | envolvem o shell em `ClerkAppProvider` |
| `src/app/(public)/login/layout.tsx`, `.../register/layout.tsx`, `src/app/{onboarding,aceite-termos,acesso-indisponivel,acesso-sessoes,conta}/layout.tsx` | novos, 1 linha cada: `export { ClerkSegmentLayout as default }` |
| `tests/unit/performance-clerk-scope.test.mjs` | testes de regressão: 5 de escopo + 4 de grafo de importações (rota → código de navegador do Clerk) |
| `docs/qa/etapa-6/*` | este relatório, a comparação bruta e os scripts de medição usados |

Não foram tocados: páginas legais, `[BLOCKED]`, SEO das etapas 1–5, Supabase, pagamentos, variáveis, middleware, Search Console.

## 5. Testes executados (branch `perf/etapa-6-clerk-scope`)

| Comando | Resultado |
|---|---|
| `npm run lint` | 0 erros, 10 avisos antigos (preexistentes, os mesmos da `main`) |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | 261 testes: 260 passam, 0 falham, 1 pulado (preexistente) |
| `node --test tests/unit/performance-clerk-scope.test.mjs` | 9/9 |
| `npm run build` (produção, `VERCEL_ENV=production`, `NEXT_PUBLIC_APP_URL=https://primeges.com.br`; variáveis só na memória do processo, nenhum `.env*` criado) | sucesso; mesmas rotas estáticas/dinâmicas da `main` |
| `npm run test:seo` contra `next start` do build da Etapa 6 | 44/44 |

Controle negativo: removendo temporariamente `src/app/conta/layout.tsx`, os testes de cobertura FALHAM (3 deles); restaurado, 9/9. Ou seja, os testes detectam uma rota que ficaria sem provider.

Os testes de grafo calculam, para cada página, tudo que ela alcança (página + layouts ancestrais, inclusive o raiz, transitivamente) e provam: (a) nenhuma página sem provider alcança código de navegador do Clerk; (b) toda página que alcança esse código está sob um layout com provider; (c) o conjunto de arquivos que usam a API de navegador do Clerk é exatamente o esperado (novo uso obriga rever o escopo).

## 6. Matriz de rotas

| Rota | Provider necessário | APIs do Clerk | Testado (local, sem sessão) |
|---|---|---|---|
| `/`, 4 páginas legais | não | nenhuma | HTML sem referência ao Clerk; FAQ, menu, âncoras desktop; JSON-LD; test:seo; console limpo |
| `/conta-excluida` | não | nenhuma | 200 + noindex |
| `/login` | sim | `<SignIn/>` | carrega, Clerk monta e o formulário aparece, inclusive por navegação do lado do cliente vindo da home; sem erros |
| `/register` | sim | `<SignUp/>` (após aceite) | carrega; **no ambiente local mostra "documentos legais indisponíveis" (igual na base)**; o `<SignUp/>` não chegou a renderizar |
| `/onboarding`, `/aceite-termos`, `/acesso-sessoes`, `/acesso-indisponivel`, `/conta` | sim | `useClerk` / sessão | só o redirect de anônimo (307 → `/login?next=…`), idêntico à base; página real NÃO |
| `/app/**` e módulos | sim | `UserMenu` (`useClerk`) | só o redirect de anônimo; NÃO com sessão |
| `/admin/**` | sim | `UserMenu` (`useClerk`) | só o redirect de anônimo; NÃO com sessão |

Navegação do lado do cliente home → `/login` (provider monta depois da hidratação) e `/login` → `/register` (clique em "Registre-se") funcionam, sem erros de console.

## 7. Teste autenticado real: BLOQUEADO

Não há conta de teste autorizada (a documentação do projeto confirma: `docs/qa/go-live-final.md`, `docs/qa/manual-auth-t10-checklist.md`) e o agente não cria contas nem entra no Clerk. Nada foi simulado.

Roteiro manual para o proprietário (ambiente TEST, nunca Production; use a base do checklist existente `docs/qa/manual-auth-t10-checklist.md`, seções A e B):

1. Subir o build da Etapa 6 (`npm run build && npm run start` com `.env.local` do TEST: Supabase TEST `zlmxbqlpjstmllrvafmy`, Clerk `pk_test_`).
2. Anônimo: abrir `/app`, `/admin`, `/onboarding`, `/conta` → cada um vai para `/login?next=…`.
3. Na home (sem sessão), clicar em "Entrar": o formulário do Clerk aparece em português.
4. Entrar com a conta de teste → cai em `/app` (ou `/onboarding` se for conta nova), sem loop; recarregar várias vezes e continuar logado.
5. Abrir 3–4 módulos em `/app` (clientes, vendas, caixa…), voltar à home pelo logotipo e entrar de novo em `/app` (provider remonta; não pode deslogar).
6. Ficar 2–3 minutos parado em `/app` e navegar de novo: a sessão renova (o clerk-js continua ativo dentro de `/app`).
7. Menu do usuário → Sair → volta ao público; `/app` volta a pedir login; botão "voltar" do navegador não mostra dados.
8. `/conta`: a página abre e o painel de exclusão aparece (NÃO confirmar a exclusão, exceto com uma conta descartável).
9. Com um administrador de teste: `/admin` abre; com usuário comum: `/admin` volta para `/app`.
10. Console do navegador em todas as etapas: sem erro `useClerk can only be used within <ClerkProvider />` e sem erro de hidratação.

Critério: qualquer falha em 4–7 ou 10 reprova a Etapa 6.

## 8. Performance antes/depois

- Ferramenta: Chrome 155 headless via protocolo CDP, scripts em `docs/qa/etapa-6/lab/` (sem instalar nada; Lighthouse não está instalado).
- Condições iguais nos dois lados: build de produção (`next build --webpack`, Next 16.3.7), `next start` local, cache desligado, aba nova por execução, 4 s de observação pós-`load`.
- Perfil móvel: 390×844 @3x, CPU 4× mais lenta, rede 1,6 Mbps / RTT 150 ms. Desktop: 1350×940 sem limitação.
- Base = `origin/main` `fa05032` construída em worktree temporário (já removido); Etapa 6 = `perf/etapa-6-clerk-scope` `cfc6f73` + testes. Os dois servidores rodaram ao mesmo tempo (portas 3101 e 3100) e as rodadas foram intercaladas (base, Etapa 6, base, …) para igualar ruído do sistema.
- Bruto completo: `docs/qa/etapa-6/comparacao.txt` (execuções individuais de LCP incluídas).

Resumo (medianas; Δ = Etapa 6 − base):

| Página | Perfil | LCP | FCP | JS KB | Bytes totais |
|---|---|---|---|---|---|
| `/` | celular | 2904 → 2120 (−27,0 %) | 1424 → 1192 (−16,3 %) | 588,8 → 199,6 (−66,1 %) | 751 → 321 KB (−57 %) |
| `/` | desktop | 208 → 204 (ruído) | 208 → 204 | 588,7 → 199,6 (−66,1 %) | 750 → 318 KB (−58 %) |
| `/termos-de-uso` | celular | 996 → 896 (−10,0 %) | idem | 589,6 → 200,4 (−66,0 %) | 742 → 313 KB (−58 %) |
| `/login` | celular | 2492 → 2360 (−5,3 %) | 876 → 804 | 629 → 629 (0 %) | −2,3 % |
| `/register` | celular | 2908 → 2764 (−5,0 %) | 1240 → 1156 | 595 → 595 (0 %) | −2,4 % |

Limitações e honestidade:
- Laboratório local, um navegador, servidor local (TTFB ~7 ms). Não são Core Web Vitals de usuários reais e não dizem nada sobre produção. TBT é proxy; INP não foi medido.
- Os ganhos de LCP no celular vêm da redução de bytes concorrentes na rede lenta simulada; em rede boa o efeito é pequeno (desktop: dentro do ruído; as primeiras execuções de cada série são lentas por partida a frio).
- `/login` e `/register` continuam carregando o Clerk (corretamente). A pequena diferença de bytes (~17 KB) vem do HTML sem o estado do Clerk; LCP −5 % nessas páginas está dentro da variação e não deve ser tratado como ganho comprovado. `/register` no celular teve TBT 76 → 98 ms (variação; sem conclusão).
- Dados do Clerk em modo desenvolvimento (`*.clerk.accounts.dev`); em produção os arquivos vêm do domínio do Clerk de produção (tamanho esperado parecido, NÃO medido).

## 9. Regressões e compatibilidade

- SEO das etapas 1–5: `test:seo` 44/44 no build da Etapa 6; JSON-LD, canonical, `og:url`, FAQ no HTML, robots, sitemap, ícones iguais à `main`.
- Redirects de anônimo: `/app`, `/admin`, `/onboarding`, `/conta`, `/acesso-sessoes`, `/aceite-termos`, `/acesso-indisponivel` respondem exatamente como na base (comparado lado a lado).
- Navegador: FAQ (Enter abre, setas movem o foco, Espaço abre/fecha, um item por vez), âncoras do cabeçalho no desktop rolam até a seção, menu móvel abre/fecha, sem rolagem horizontal, 0 erros de console, nenhum erro de hidratação.
- axe-core 4.10 (rodada anterior, mesmo código): home 0 violações, login 0.
- **Achado preexistente (NÃO causado pela Etapa 6, mesmo na `main` publicada):** no celular, os links do **menu móvel** (`#precos` etc.) fecham o menu e mudam o hash, mas **a página não rola** (confirmado com clique real, em `main` e na Etapa 6; `scrollY` fica em 0). No desktop as âncoras rolam normalmente. Provável causa: o bloqueio de rolagem do Sheet (Radix) ainda ativo quando o navegador tenta rolar. Fora do escopo desta etapa; sugerido como correção separada.

## 10. Segurança e escopo

Confirmado: sem mudança em produção, Supabase (schema, dados, migrações), variáveis de ambiente (nenhum `.env*` criado; variáveis lidas só na memória do processo para build/servidor local), Vercel, pagamentos/EvoPay, planos, usuários, DNS, páginas legais, `[BLOCKED]` ou Search Console. Sem push, merge ou deploy. Nenhuma conta foi criada ou usada no Clerk.

## 11. Pendências e menor próxima ação do proprietário

1. Executar o roteiro da seção 7 com uma conta de teste (ambiente TEST). É a única pendência para considerar a Etapa 6 validada para produção.
2. (Separado, opcional) Corrigir a rolagem dos links do menu móvel (achado da seção 9).

## 12. Decisão recomendada

Manter a branch isolada (`perf/etapa-6-clerk-scope`) até o roteiro autenticado ser executado. Se passar, a Etapa 6 fica pronta para uma futura autorização de release (ganho medido: −66 % de JS e −27 % de LCP no celular em laboratório). Se falhar, a correção é pontual por rota e os testes de grafo indicam onde. O commit local NÃO é aprovação para produção.

## 13. Revalidação de continuidade (2026-10-26, 15:59–16:05 -03:00)

Segunda passada de auditoria sobre a mesma branch, sem alterar código. Tudo abaixo foi executado nesta passada, no worktree `saas-project-fase3`.

**Estado Git verificado.** Branch `perf/etapa-6-clerk-scope` em `77f79d3`, sobre o merge `cfc6f73` (que contém `origin/main` = `fa05032`). Backup `perf/etapa-6-clerk-scope-backup` = `b03a690`. `git ls-remote --heads origin perf/etapa-6-clerk-scope` = 0 (nunca enviada). Árvore limpa, exceto 4 itens não rastreados que já existiam e ficaram intactos: `.playwright-mcp/`, `.serena/`, `docs/AUDITORIA_GO_LIVE_2026-10-18_a_21.md`, `supabase/candidates/`.

**Diff auditado.** 17 arquivos, +764/−27 contra `origin/main`. Nenhum toca `middleware`, `lib/auth`, Supabase, `.env*`, páginas legais, sitemap/robots. O código de aplicação muda só em: `ClerkProvider` retirado do layout raiz, `ClerkSegmentLayout`, 7 layouts de uma linha, e `<ClerkAppProvider>` em `(app)/layout.tsx` e `admin/layout.tsx` (depois das checagens de sessão/papel, que não mudaram).

**Comandos desta passada**

| Comando | Resultado |
|---|---|
| `npm run lint` | exit 0 — 0 erros, 10 avisos (os mesmos de antes) |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | exit 0 — 261 testes, 260 passam, 0 falham, 1 ignorado |
| `tests/unit/performance-clerk-scope.test.mjs` | 9/9 |
| `npm run build` (env só na memória do processo) | exit 0, sem "error" no log |
| `npm run test:seo` (sem servidor) | 37 passam; a suíte dinâmica é ignorada sem `SEO_BASE_URL` |
| `SEO_BASE_URL=http://localhost:3100 npm run test:seo` (`next start`) | 44/44 |

O teste ignorado é `tests/unit/legal.test.mjs:66` (`LEGAL_REQUIRE_PUBLISHABLE=1`), idêntico em `origin/main`: preexistente, não removido.

**Navegador (Playwright, 390 px, build local)**
- Home: nenhum script do Clerk, `window.Clerk` inexistente, 0 erros de console (2 avisos de preload de CSS, sem relação com o Clerk).
- `/login`: `window.Clerk.loaded = true`, formulário do Clerk com campos `identifier` e `password`, sem rolagem horizontal, 0 erros de console.
- Anônimo em `/app`, `/admin`, `/onboarding`, `/conta`, `/acesso-sessoes`, `/aceite-termos`: 307 para `/login?next=…`; `/acesso-indisponivel`: 307 para `/login`. Igual ao registrado na seção 9. (Não comparei de novo lado a lado com a `main` nesta passada.)

**Benchmark.** Não repetido. Os valores da seção 8 são da passada anterior (intercalada, n=15 por lado na home) e não foram reproduzidos nesta execução.

### Diagnóstico do cadastro (`/register`)

- A mensagem "documentos legais estão indisponíveis" sai de `src/app/(public)/register/page.tsx:34`, quando `getPublishedLegalVersions()` devolve nulo ou `integrity !== "OK"`. Isso acontece antes de qualquer `<SignUp/>`; não tem relação com o Clerk nem com a Etapa 6.
- O `.env.local` local aponta para o banco `primeges-TESTE-isolado` (confirmado por comparação do identificador do projeto, sem imprimir URL ou chaves).
- Consulta somente leitura à RPC pública `get_current_legal_documents` nesse banco: HTTP 200, `TERMS_OF_USE` e `PRIVACY_POLICY` na versão `1.0.0-rc.2`. O código da branch (e da `main`) espera `1.0.0-rc.3` (`src/content/legal/terms-of-use.ts:21`, `privacy-policy.ts:20`). Versão diferente ⇒ `MISMATCH` ⇒ cadastro "pausado".
- Em `https://primeges.com.br/register` (GET público), a mensagem **não** aparece e o passo 1 (aceite dos documentos) é exibido. Logo, em Production a versão publicada bate com o código.
- Conclusão: causa mais provável e consistente com todas as evidências é o banco TEST estar uma versão legal atrás do código (rc.2 vs rc.3). Não é evidência de regressão da Etapa 6; também ocorria na `main`. Não comparei os hashes do banco com os do código (o módulo não importa fora do build); a diferença de versão já basta para o `MISMATCH`.
- Não foi alterado nada: nenhum aceite padrão, nenhum bypass, nenhuma edição de páginas legais ou do banco. Colocar o TEST na rc.3 exige aplicar a migration de publicação da rc.3 no banco de TESTE — decisão e ação do proprietário.
- **O cadastro continua NÃO VALIDADO visualmente**, com a Etapa 6 ou sem ela. O `<SignUp/>` está coberto pelo teste de grafo (a rota `/register` tem o provider), mas ninguém o viu renderizar nesta branch.

### Menu móvel (preexistente, fora do escopo)

Reproduzido de novo nesta passada, apenas na branch da Etapa 6 (390×844): com clique real do Playwright em "Preços" o menu fecha e o hash vira `#precos`, mas `scrollY` fica em 0 (o alvo está a ~9.900 px). Um `.click()` programático via JavaScript rolou normalmente, o que reforça que o problema depende do clique real e do bloqueio de rolagem do menu. Não corrigido, não misturado com a Etapa 6. Nesta passada não testei a `main`; o registro de que ocorre na `main` vem da passada anterior.

### Ajustes ao roteiro da seção 7

- Passo 1: o TEST está na rc.3-menos-1 (rc.2). Isso não impede entrar com uma conta já existente, mas `/register` e possivelmente a tela `/aceite-termos` mostram "indisponível" até o TEST ser atualizado. Se isso acontecer no passo 4, registre como **BLOQUEADO (ambiente)**, não como falha da Etapa 6.
- Registre cada passo como **passou**, **falhou**, **não aplicável** ou **bloqueado**, com navegador/dispositivo e a mensagem de erro, sem senha, cookie, token ou imagem com dados pessoais.
- Passo 9: um usuário sem papel de administrador ser mandado de `/admin` para `/app` é o comportamento **correto** (acesso negado), não uma falha.
- Passos 4–7 e 10 reprovam a etapa se falharem de verdade (não por bloqueio de ambiente).

### AÇÃO NECESSÁRIA DO USUÁRIO

1. Rodar o roteiro da seção 7 com uma conta de teste sua, no ambiente TEST, e devolver o resultado de cada passo (sem credenciais).
2. (Opcional, só se quiser ver o cadastro) decidir se o banco TEST recebe a publicação da rc.3. O agente não faz isso.

### Estado de prontidão

**BLOQUEADA — TESTE AUTENTICADO DO USUÁRIO PENDENTE.** Verificações técnicas locais passam; nenhuma regressão técnica encontrada. Isso não é aprovação para produção, e nada foi enviado, mesclado ou publicado.
