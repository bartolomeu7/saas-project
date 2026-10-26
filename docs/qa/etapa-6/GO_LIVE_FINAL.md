# Etapa 7 — Fechamento da Etapa 6 e Go Live controlado (relatório)

Data: 2026-10-26 (fuso -03:00). Executado no worktree `saas-project-fase3`.

## Estado final: RELEASE PREPARADO — PUBLICAÇÃO PENDENTE

**Nenhum merge, promote ou deploy foi feito.** A produção continua em `fa05032` (sem a Etapa 6). O motivo é um único gate crítico que o agente não pode satisfazer sozinho: o **teste autenticado real** (login → `/app` → sair → `/conta` → `/admin`) com uma conta de teste autorizada. Não existe essa conta e este agente não cria usuários nem usa a conta pessoal do dono. Tudo o que é independente desse gate foi feito e está abaixo.

Legenda: **[V]** verificado nesta missão · **[R]** informado em relatório anterior, não reexecutado · **[I]** inferência · **[P]** pendente.

## 1. Git — estado inicial e final

- **[V]** Branch `perf/etapa-6-clerk-scope` em `77f79d3` (sobre o merge `cfc6f73`, que contém `origin/main` = `fa05032`). Backup `perf/etapa-6-clerk-scope-backup` = `b03a690`, preservado.
- **[V]** `git fetch origin` feito; `origin/main` continua `fa05032`. Contagem `origin/main...HEAD` = 0 à esquerda, 3 à direita (nenhum commit novo em `main`).
- **[V]** Não rastreados preexistentes, intocados: `.playwright-mcp/`, `.serena/`, `docs/AUDITORIA_GO_LIVE_2026-10-18_a_21.md`, `supabase/candidates/`.
- **[V]** Alterações desta missão: `docs/qa/etapa-6/RELATORIO.md` (seção 13, passada anterior) e este arquivo. Nenhum código de aplicação foi alterado.

## 2. Produção atual (fonte: GitHub Deployments + Vercel + GET público)

- **[V]** Deployment Production ativo: id `7334675265`, commit `fa05032`, estado `success`, criado em 2026-10-26T14:36:33Z (`saas-project-95mwdvtm0-juninhormatos-9956s-projects.vercel.app`).
- **[V]** Alvo de rollback hoje: id `7225035889`, commit `625cb14` (2026-10-21T11:38:44Z). Depois de uma eventual publicação da Etapa 6, o alvo de rollback passa a ser o `7334675265` (`fa05032`).
- **[V]** CI da `main` (Phase 3 CI): sucesso em `fa05032`, `625cb14`, `2ac4e12`.
- **[V]** Domínio `primeges.com.br` verificado no projeto; certificado Let's Encrypt válido até 2027-01-22.
- **[V]** Cabeçalhos da home: HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. Sem CSP (item já registrado em `docs/go-live-pendencias.md`).
- **[V]** A home em produção ainda carrega `clerk.primeges.com.br/.../clerk.browser.js` e `ui.browser.js` — é o estado **antes** da Etapa 6.

## 3. Commit candidato e arquivos do release

- Candidato: `perf/etapa-6-clerk-scope`, diff contra `origin/main` = 17 arquivos (+764/−27): 1 provider ajustado, `src/app/layout.tsx`, `(app)/layout.tsx`, `admin/layout.tsx`, 7 layouts de uma linha, 1 teste, e `docs/qa/etapa-6/*`. Sem migration, sem `.env*`, sem middleware/auth/Supabase/legal/sitemap/robots **[V]**.
- Commit publicado: **nenhum**.

## 4. Testes desta missão (worktree `saas-project-fase3`, Node local)

| Verificação | Resultado |
|---|---|
| `npm run lint` | exit 0 — 0 erros, 10 avisos (os mesmos herdados) |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | exit 0 — 261 testes, 260 passam, 1 ignorado |
| `tests/unit/performance-clerk-scope.test.mjs` | 9/9 |
| `npm run build` | exit 0 |
| `SEO_BASE_URL=http://localhost:3100 npm run test:seo` | 44/44 (37 sem servidor; a suíte dinâmica é ignorada sem URL) |

Teste ignorado: `tests/unit/legal.test.mjs:66` (`LEGAL_REQUIRE_PUBLISHABLE=1`), idêntico em `origin/main`; preexistente. Os 10 avisos de lint são `react-hooks/set-state-in-effect` e afins, herdados. Detalhes e comandos da passada anterior na seção 13 de `RELATORIO.md`. **[V]**

Navegador (Playwright, 390 px, build local): home sem script nem `window.Clerk`, 0 erros de console; `/login` com `window.Clerk.loaded = true`, campos `identifier`/`password`, sem rolagem horizontal. **[V]**

Anônimo em rotas privadas (build local): `/app`, `/admin`, `/onboarding`, `/conta`, `/acesso-sessoes`, `/aceite-termos` → 307 para `/login?next=…`; `/acesso-indisponivel` → 307 para `/login`. **[V]**

CI no GitHub (Node 22): ver seção 11.

## 5. Auditoria do diff e da autenticação

- **[V]** `clerkMiddleware` em `src/middleware.ts` não foi tocado; o teste de escopo verifica que continua sendo o middleware de todas as rotas.
- **[V]** `(app)/layout.tsx` e `admin/layout.tsx`: o `ClerkAppProvider` foi colocado **em volta do shell, depois** de `requireLegalConsent`, `evaluateSessionGate`, `requirePlatformAdmin` e dos redirects. A ordem e a semântica dessas guardas não mudaram (o diff só envolve o `return`).
- **[V]** Teste de grafo de importações: nenhuma página sem provider alcança código de navegador do Clerk; toda página que alcança está sob um layout com provider. Controle negativo (remover `conta/layout.tsx`) faz o teste falhar (passada anterior).
- **[I]** O risco residual da Etapa 6 é de **runtime autenticado** (renovação de sessão do `clerk-js` ao trocar de rota pública para `/app`, remontagem do provider, `UserMenu`). Testes estáticos e anônimos não o cobrem. É exatamente o gate pendente.

## 6. Cadastro e divergência rc.2 × rc.3 (causa raiz)

- **[V]** Mensagem "documentos legais indisponíveis" vem de `src/app/(public)/register/page.tsx:34`, antes de qualquer `<SignUp/>`: `getPublishedLegalVersions()` nulo ou `integrity !== "OK"`.
- **[V]** `.env.local` local aponta para `primeges-TESTE-isolado` (`zlmxbqlpjstmllrvafmy`), por comparação do identificador do projeto, sem imprimir URL/chaves.
- **[V]** RPC pública `get_current_legal_documents` no TEST: `TERMS_OF_USE` e `PRIVACY_POLICY` em `1.0.0-rc.2`. Código: `1.0.0-rc.3` (`src/content/legal/terms-of-use.ts:21`, `privacy-policy.ts:20`).
- **[V]** `list_migrations` (somente leitura): **Production** tem `20261021113639 account_self_deletion` e `20261021113708 legal_rc3`; **TEST** não tem nenhuma das duas (última legal = `legal_rc2`).
- **[V]** `https://primeges.com.br/register` hoje mostra "Primeiro, leia e aceite os documentos abaixo" e **não** mostra a mensagem de indisponibilidade.
- **Conclusão:** a divergência é **só de ambiente**: o banco TEST está duas migrations atrás do código (`account_self_deletion` e `legal_rc3`). Não há incompatibilidade de código: a Production tem a rc.3 e o cadastro funciona até o passo de aceite. Nenhum banco foi alterado.
- **[P]** O passo 2 (o formulário `<SignUp/>` do Clerk) **não foi visto renderizado** nem em local nem em produção: chegar nele exige aceitar os termos, o que a missão proíbe fazer em nome de alguém.
- **Ação do dono (se quiser ver o cadastro no TEST):** aplicar `account_self_deletion` e `legal_rc3` no banco TEST. O agente não executa.

## 7. Teste autenticado real

**BLOQUEADO PARA TESTE PELO USUÁRIO.** Sem conta de teste autorizada (nem de administrador). Nada foi simulado, nenhuma conta criada, nenhuma credencial usada. Roteiro (10 passos, ambiente TEST, sem enviar senha/cookie) em `RELATORIO.md` seção 7 e ajustes na seção 13. Ver "AÇÃO NECESSÁRIA" ao final.

## 8. Legal, `[BLOCKED]` e Search Console

- **[V]** `docs/go-live-pendencias.md` (de 2026-10-21): os Termos e a Política `1.0.0-rc.3` **já estão no ar em Production com 11 campos `[BLOCKED — DADO EMPRESARIAL NECESSÁRIO]`**, "por decisão do dono, com pendências anotadas". `/termos-de-uso`, `/politica-de-privacidade`, `/politica-de-reembolso` e `/direitos-do-titular` respondem 200 em produção hoje.
- **Impacto neste release:** a Etapa 6 **não toca** em nenhum texto legal, não muda a versão nem o hash; portanto não cria, agrava nem resolve esse bloqueio. Classifico como pendência **crítica de natureza jurídica, preexistente e já decidida pelo dono**, não como bloqueio específico da Etapa 6. Não declaro conformidade jurídica, não removi `[BLOCKED]`, não escrevi texto legal. Para tirar os marcadores: preencher os dados da empresa e gerar a rc.4 (texto → hash → migration → deploy) — responsável: dono/jurídico.
- **[V]** Search Console: não tocado (adiado pelo dono).

## 9. Configuração e variáveis (somente nomes e escopo; nenhum valor reproduzido)

Variáveis de **Production** na Vercel presentes **[V]**: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_live_`), `CLERK_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL` (registro compartilhado preview+production), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `EVOPAY_API_BASE_URL`, `EVOPAY_API_KEY`, `ANTIFRAUD_HASH_SECRET`, e as variáveis da integração Supabase↔Vercel.

- **`NEXT_PUBLIC_APP_URL`: ausente em Production [V].** O código usa o fallback `https://primeges.com.br` (igual ao comportamento atual da `main`, incluindo o callback do EvoPay). Não alterado. Classificação: desejável.
- `RESEND_API_KEY`/`EMAIL_FROM`: ausentes; e-mail de confirmação de exclusão de conta está desativado por decisão do dono (`go-live-pendencias.md`).
- Observação de higiene (já documentada em `docs/ci-and-environments.md`): `NEXT_PUBLIC_SUPABASE_URL` tem um registro com alvo preview+production. Não alterado.
- Preview: só as branches antigas `feat/clerk-auth-prep`, `feat/ui-revamp-shadcn` e `feat/mission-08-admin-control-center` têm credenciais de TEST/dev; um Preview de `perf/etapa-6-clerk-scope` compila mas **não** exerce autenticação **[V por leitura]**.
- Pagamentos/EvoPay/webhooks: não tocados e não exercitados (sem sandbox).
- Monitoramento: não foi feita inspeção de logs de runtime nesta missão **[P]**.

## 10. Menu móvel (preexistente)

- **[V]** Em **produção atual** (`fa05032`, 390×844), clique real do Playwright em "Preços" no menu: o menu fecha, URL vira `https://primeges.com.br/#precos`, `scrollY` = 0, alvo `#precos` a 9.916 px do topo, nenhum erro de console. Na branch da Etapa 6 (build local), mesmo resultado. Um `.click()` programático por JavaScript rolou, o que indica dependência de timing com o bloqueio de rolagem do Sheet — **causa não provada**.
- Local: `src/components/marketing/site-header.tsx` (Sheet + `SheetClose asChild` + `Link href="#precos"`).
- **Classificação P2.** Não impede alcançar o conteúdo (rolagem manual; botões "Criar conta"/"Entrar" do menu funcionam), então **não** é requisito de Go Live. Não corrigido nesta missão para não misturar com o release da Etapa 6 e manter o rollback atribuível. Recomendação: PR separado, com teste de clique real.

## 11. PR, merge e deploy

Nenhum merge, promote ou deploy. Ver seção "Publicação" abaixo para o PR de rascunho aberto só para obter CI (se aberto).

## 12. Pós-deploy

Não aplicável: nada foi publicado.

## 13. Performance (laboratório)

**[R]** — não reproduzido nesta missão. Metodologia da passada anterior: Chrome 155 headless por CDP, builds de produção locais da base `fa05032` e da Etapa 6, servidores simultâneos, rodadas intercaladas, 390×844 @3x, CPU 4×, 1,6 Mbps / 150 ms RTT, 15 execuções por lado na home. Home celular: LCP mediano 2904 → 2120 ms, JS transferido 588,8 → 199,6 KB, requisições Clerk 8 → 0. Isso é **laboratório**, não Core Web Vitals de usuários reais.

## 14. Plano de rollback

- **Condição para acionar após um deploy da Etapa 6:** login ou `/app` quebrado para qualquer conta; erro `useClerk can only be used within <ClerkProvider />` nos logs ou no console; loop de redirect; deslogar sozinho ao navegar da home para `/app`; `/admin` acessível a quem não é admin.
- **Como:** no painel da Vercel, promover novamente o deployment `7334675265` (commit `fa05032`) para Production ("Promote to Production"/rollback). Não destrutivo, não mexe em banco nem em variáveis. Alternativa pelo Git: `git revert -m 1` do merge da Etapa 6 em PR novo (nunca force push).
- O release não inclui migration, portanto não há rollback de dados.

## 15. Pendências com prioridade, responsável e ação mínima

| # | Item | Prioridade | Responsável | Ação mínima |
|---|---|---|---|---|
| 1 | Teste autenticado real da Etapa 6 | **P1 (release gate)** | Dono | Rodar o roteiro de `RELATORIO.md` §7 com conta de teste no TEST e devolver PASSOU/FALHOU/BLOQUEADO por passo |
| 2 | 11 campos `[BLOCKED]` nos textos legais em produção + revisão jurídica | **P0 jurídico (preexistente, decidido pelo dono)** | Dono/jurídico | Fornecer dados da empresa; gerar rc.4 |
| 3 | Banco TEST sem `account_self_deletion` e `legal_rc3` | P2 (ambiente) | Dono | Aplicar as 2 migrations no TEST se quiser testar cadastro/exclusão lá |
| 4 | Passo 2 do cadastro (`<SignUp/>`) nunca visto renderizado nesta branch | P1 | Dono (no teste do item 1) | Incluir cadastro com e-mail descartável no TEST após o item 3 |
| 5 | Menu móvel não rola ao tocar em âncora | P2 | Dev | PR separado |
| 6 | `NEXT_PUBLIC_APP_URL` ausente em Production | P3 | Dono | Definir `https://primeges.com.br` (opcional; fallback funciona) |
| 7 | Search Console | P3 (adiado) | Dono | Quando decidir |
| 8 | Sem CSP; sem `security.txt`; e-mail de exclusão de conta desativado; demais itens de `go-live-pendencias.md` | P2/P3 | Dono | Conforme o documento |
| 9 | Inspeção de logs de runtime em produção | P2 | Dono/dev | Fazer após o próximo deploy |

## 16. Critérios de Go Live (mapa)

| Critério | Estado |
|---|---|
| Commit publicado identificado e confirmado | N/A — nada publicado |
| CI, lint, typecheck, testes, build | local OK **[V]**; CI do PR conforme seção 11 |
| Fluxos públicos essenciais | OK local; produção atual OK **[V]** |
| Login e sessão validados de forma autorizada | **NÃO** — bloqueado |
| Permissões e rotas privadas | anônimo OK **[V]**; com papéis: **NÃO validado** |
| Cadastro não bloqueado para novos usuários | em Production o passo 1 funciona **[V]**; passo 2 não visto |
| Bloqueio legal crítico ignorado? | Não ignorado; preexistente e decidido pelo dono (§8) |
| Deployment ativo confirmado / pós-deploy | N/A |
| Rollback documentado | Sim (§14) |

Resultado: o critério "login e sessão validados de forma autorizada" não é satisfeito, portanto **não é permitido declarar Go Live concluído**, e o agente não publica uma mudança de arquitetura de autenticação sem esse teste.

## AÇÃO NECESSÁRIA DO USUÁRIO

1. **Executar o roteiro da Etapa 6** (`RELATORIO.md` §7) com uma conta de teste sua, no TEST, e devolver o resultado por passo (sem senha, cookie ou token). Falha nos passos 4–7 ou 10 reprova.
2. **Depois do "passou"**, dizer explicitamente "pode publicar a Etapa 6". Com isso o agente faz o merge do PR pelo fluxo normal, acompanha o deploy, e roda a validação pós-deploy da seção 13 de `RELATORIO.md` / este relatório.
3. (Opcional) Aplicar `account_self_deletion` e `legal_rc3` no TEST para ver o cadastro renderizar.
