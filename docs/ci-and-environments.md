# CI e ambientes (Missão 07)

## CI (`.github/workflows/phase3-ci.yml`, job `verify`)

Dispara em pull request para `main` e push em `main`. Passos: `actions/setup-node@v4` com `node-version-file: .nvmrc` (**Node 22**), `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`. O build usa variáveis de ambiente falsas (placeholders), sem segredo.

Observações:

- `package.json` não recebeu `engines`, de propósito: isso poderia mudar o runtime da Vercel.
- `test:unit` é `node --no-warnings --experimental-strip-types --test "tests/unit/*.test.mjs"` (Node 22 suporta a flag; local foi validado em Node 24). **A execução no GitHub Actions com Node 22 não foi verificada** (sem push/CI nesta sessão).
- Testes de integração (`npm run test:integration:billing`) e as baterias `tests/sql/*.sql` rodam **manualmente contra TEST**, não no CI.
- Lint tem 11 *warnings* herdados (`react-hooks/set-state-in-effect` etc.) e 0 erros.

## Causa raiz do Preview quebrado

1. O build de Preview não tinha `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` nem `SUPABASE_SERVICE_ROLE_KEY` no escopo Preview (existem só em Production, ou com escopo de branches antigas `feat/clerk-auth-prep` e `feat/ui-revamp-shadcn`).
2. O layout autenticado `(app)` era pré-renderizado estaticamente no build e chamava Clerk/Supabase sem credenciais → falha.

**Correção no código (feita):** `export const dynamic = "force-dynamic"` em `src/app/(app)/layout.tsx`. Reproduzido: o build com anon/Clerk/service role vazios falhava antes e passa agora.

**Correção de configuração (NÃO executada, exige a Vercel):**

- `NEXT_PUBLIC_SUPABASE_URL` hoje está num único registro com alvo *preview + production*: o Preview apontaria para o banco de Production. Separar em dois registros: Production → URL de Production; Preview → URL de TEST (`zlmxbqlpjstmllrvafmy`).
- Criar no escopo **Preview** (somente credenciais de TEST/desenvolvimento, nunca as de Production): `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` e `CLERK_SECRET_KEY` (instância de desenvolvimento do Clerk), `SUPABASE_SERVICE_ROLE_KEY` de TEST. Opcionais: `NEXT_PUBLIC_APP_URL`, `APP_ENV`. `EVOPAY_*` só se for testar cobrança no Preview (não recomendado: sem sandbox).
- Nenhuma variável de Production foi alterada.

Enquanto o Preview não tiver essas variáveis, ele compila (graças ao layout dinâmico), mas as páginas autenticadas não funcionam. **Deployment de Preview real: NOT VERIFIED.**

## Matriz de ambientes

| | Production | TEST |
|---|---|---|
| Supabase | `fpbcruinppjbwtinzrdg` | `zlmxbqlpjstmllrvafmy` |
| Clerk | `clerk.primeges.com.br` | instância de desenvolvimento |
| Uso | smoke e inspeção somente leitura | migrations e baterias destrutivas (sempre em transação com rollback) |
