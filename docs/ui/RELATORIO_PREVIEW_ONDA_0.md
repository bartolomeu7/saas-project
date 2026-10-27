# Relatório — Preview online da Onda 0 (design system)

Data: 2026-10-27. Escopo: publicar um deployment **Preview** do Vercel da branch da Onda 0. Sem merge em `main`, sem deploy de produção, sem alteração de domínio, sem mutações em dados reais.

## 1. Git

| Item | Antes | Depois |
|---|---|---|
| Branch | `ui/onda-0-design-system` (HEAD `709817b`, sem commits próprios, alterações só no working tree) | `ui/onda-0-design-system` @ `e268814`, enviada para `origin` (push normal, sem `--force`) |
| Base | `origin/main` = `709817b` (conferido após `git fetch`; PR #41 `MERGED` em 2026-10-27T00:26:05Z, squash `fc6cf8c`) | idem |

Commit `e268814` — `feat(ui): fundação do design system (Onda 0)`. Nenhum PR foi aberto.

Arquivos incluídos (8, +373/−4):

- `src/app/globals.css`
- `src/components/app/app-sidebar.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/button.tsx`
- `tailwind.config.ts`
- `tests/unit/design-tokens.test.mjs` (novo)
- `docs/ui/ONDA_0_FUNDACAO_DESIGN_SYSTEM.md` (novo)
- `docs/ui/RELATORIO_ONDA_0_FUNDACAO_DESIGN_SYSTEM.md` (novo)

Não incluídos de propósito (preexistentes/não relacionados): `.playwright-mcp/`, `.serena/`, `AUDITORIA_UI_PRIME_GES_FUSAO_TEMPLATES.md`, `docs/AUDITORIA_GO_LIVE_2026-10-18_a_21.md`, `supabase/candidates/`, e este relatório.

O diff foi revisado: nenhuma alteração em autenticação, middleware, rotas, Server Actions, dados, pagamentos, documentos legais, `package.json` ou lockfile.

## 2. Verificações locais (antes do push)

Executadas com as variáveis fictícias do workflow de CI (nenhuma credencial real).

| Comando | Código de saída | Resultado |
|---|---|---|
| `npm run test:unit` | 0 | 269 testes, 268 aprovados, 0 falhas, 1 ignorado |
| `npm run lint` | 0 | 0 erros, 10 avisos já existentes |
| `npm run typecheck` | 0 | limpo |
| `npm run build` | 0 | sucesso |
| `npm run test:seo` (após o build) | 0 | 37/37; grupo de rotas dinâmicas ignorado (exige `SEO_BASE_URL`) |
| `git diff --check` | 0 | limpo |

Observação: uma execução extra de `test:seo` feita enquanto o build ainda rodava reportou 0 testes (os arquivos gerados estavam sendo recriados). Reexecutada depois do build: 37/37.

## 3. Deployment Preview

- Mecanismo: integração GitHub–Vercel existente (deploy automático no push da branch). Nenhum comando de deploy manual, nenhum `--prod`, nenhum projeto novo.
- Projeto: `saas-project` (time `juninhormatos-9956s-projects`).
- Deployment: `dpl_FS9W8L15zAWbjYLnqaVTcFKN8CxA`, commit `e268814`, status do commit `success` ("Deployment has completed") às 2026-10-27T09:47:53Z. Log de build lido diretamente: "Build Completed", "Deployment completed".
- URL exata do Preview (alias da branch):
  `https://saas-project-git-ui-onda-0-88e8b7-juninhormatos-9956s-projects.vercel.app`
- Inspeção no painel: `https://vercel.com/juninhormatos-9956s-projects/saas-project/FS9W8L15zAWbjYLnqaVTcFKN8CxA`

## 4. Verificação da URL

**Acesso anônimo por HTTP (curl):** `/`, `/login` e `/robots.txt` respondem `302` para `https://vercel.com/sso-api?...` (Vercel Authentication ativa, cabeçalho `X-Robots-Tag: noindex`). A URL **não é pública**: só abre para quem estiver logado no Vercel com acesso ao time. Não desativei a proteção nem usei bypass (alterar proteção é configuração de segurança e fica com o dono).

**Navegador (painel do app):** abriu a página de login do Vercel, sem sessão. Não fiz login.

Consequência: Home, CSS compilado, desktop/mobile e os componentes corrigidos **não foram inspecionados**.

## 5. Matriz PASS / FAIL / BLOCKED

| Item | Resultado | Motivo |
|---|---|---|
| Build e deploy do Preview | PASS | log do Vercel + status `success` |
| Acesso público anônimo à URL | FAIL (esperado) | protegida por Vercel Authentication (302 para SSO) |
| Home e CSS compilado na URL | BLOCKED | exige login no Vercel |
| Menu suspenso | BLOCKED | idem; além disso requer shell autenticado |
| Notificações / popover | BLOCKED | idem |
| Select | BLOCKED | idem |
| Command menu | BLOCKED | idem |
| Tooltip | BLOCKED | idem |
| Mobile (390 px) | BLOCKED | idem |
| Autenticação Clerk no Preview | BLOCKED | ver seção 6 |

## 6. Variáveis de ambiente do Preview (somente nomes e escopos; nenhum valor foi lido ou copiado)

- As variáveis de Preview com chaves de teste (Supabase TEST e Clerk Development) estão vinculadas a **branches específicas** (`feat/clerk-auth-prep`, `feat/ui-revamp-shadcn`, `feat/mission-08-admin-control-center`). Nenhuma vale para `ui/onda-0-design-system`.
- Para esta branch só se aplica `NEXT_PUBLIC_SUPABASE_URL`, que está escopada a **Preview + Production** (variável compartilhada). Não há `NEXT_PUBLIC_SUPABASE_ANON_KEY` nem `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` de Preview genéricos.
- Não alterei nenhuma variável nem copiei Production para Preview.
- Implicações: (a) login Clerk e rotas autenticadas provavelmente não funcionam neste Preview; (b) como a URL do Supabase é compartilhada com Production, **não abra fluxos de escrita** neste Preview até confirmar para qual projeto Supabase ela aponta. Não decifrei o valor para não expô-lo.

## 7. Limitações e próximos passos

- Feito por automação: git, testes locais, consulta ao status/log do deployment, sondagem HTTP anônima. **Nenhuma inspeção visual real em navegador foi feita.**
- Para testar visualmente: abrir a URL logado no Vercel (conta do time). A Home deve renderizar; o shell autenticado depende de decisão sua sobre as variáveis (seção 6).
- Opções: (1) definir variáveis de Preview com Clerk Development + Supabase TEST também para esta branch (ou para todas as branches de Preview); (2) comparar os overlays localmente com `npm run dev` e chaves de desenvolvimento.
- A promoção a produção não foi tocada e só deve ser decidida após a inspeção visual.

## 8. Declaração

Sem merge em `main`, sem deploy de produção, sem alterações de domínio, sem criação de usuários, sem pagamentos, sem mutações em dados reais, sem alteração de variáveis ou de proteção do deployment.
