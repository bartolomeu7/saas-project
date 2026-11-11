# Pacote do site para subir no servidor local

> O "pacote" é o conjunto de coisas que a máquina nova precisa receber. **Nada aqui altera o site nem a Produção**: são cópias e exportações de leitura. Os comandos de exportação você roda no seu computador (eu não tenho, nem devo ter, a senha do banco).

## Visão geral (7 peças)

| # | Peça | Para quê | Quem gera | Sensível? |
|---|---|---|---|---|
| A | **Código do site** (repositório) | Rodar o site; migrations; testes SQL | `git` | Não |
| B | **Dump do banco de Produção** (esquema + dados) | Recriar o banco no servidor | Você (comando abaixo) | **SIM** (dados de clientes) |
| C | **Papéis e permissões** (GRANTs) | Segurança igual à de hoje | Vai dentro do dump B | Não |
| D | **Arquivos do Storage** | Documentos de clientes | Você (hoje: 0 arquivos) | **SIM** |
| E | **Segredos e variáveis** | O site e o banco falam entre si | Você, no cofre de senhas | **SIM** |
| F | **Configurações externas** (Clerk, EvoPay, DNS, Vercel) | Nada quebrar na virada | Checklist abaixo | Parte |
| G | **Provas** (30 baterias SQL + 951 testes) | Garantir que o banco novo se comporta igual | Já estão no repositório | Não |

---

## A. Código do site

O repositório já contém tudo: `src/`, `public/`, `supabase/migrations` (87 arquivos), `supabase/rollback`, `tests/sql` (30), `tests/unit`, `docs/`, `.nvmrc` (Node **22**), `package.json`.

No seu computador (Windows, PowerShell), na pasta do projeto:
```powershell
git bundle create primeges-codigo.bundle --all
```
Isso gera **um único arquivo** com todo o histórico. Na máquina nova: `git clone primeges-codigo.bundle primeges`.

> `node_modules`, `.next` (728 MB) e `.env*` **não** vão no pacote: são recriados/ficam só nos cofres.

---

## B. Dump do banco de Produção (a peça mais importante)

**Por quê um dump e não as migrations:** a Produção aplicou **95** migrations e o repositório tem **87**. O dump é a fotografia real e completa.

1. No painel do Supabase de Produção: **Project Settings → Database → Connection string** (modo **Session/Direct**, porta 5432). Copie para uma variável **só na sua sessão do terminal** (não salve em arquivo, não cole no chat):
   ```powershell
   $env:PGURL = "postgresql://postgres:SENHA@HOST:5432/postgres"
   ```
2. Instale o cliente do PostgreSQL **17** (precisa de `pg_dump` 17 ou superior; o banco é 17.6).
3. **Congele um instante** (sugestão: madrugada) e gere:
   ```powershell
   # esquema + dados do app (public), formato compacto e restaurável
   pg_dump $env:PGURL --schema=public --format=custom --no-owner --file=primeges-public.dump
   # esquema puro, legível, para o repositório e revisão
   pg_dump $env:PGURL --schema=public --schema-only --no-owner --file=primeges-public-schema.sql
   # histórico de migrations aplicadas (95)
   pg_dump $env:PGURL --data-only --table=supabase_migrations.schema_migrations --file=primeges-migrations-historico.sql
   ```
4. **Definições do esquema `storage`** (bucket e as 3 políticas de `storage.objects`): eu as recrio por SQL no ensaio (estão descritas abaixo), então **não** é preciso exportar o esquema `storage` inteiro.
5. Confira o arquivo: `pg_restore --list primeges-public.dump` lista as tabelas. **Guarde os dois arquivos criptografados** (7-Zip com senha, BitLocker ou cofre) e **apague a variável**: `Remove-Item Env:PGURL`.

> **Valide no ensaio** (não na Produção): papéis `anon/authenticated/service_role`, a função `auth.jwt()`, os event triggers `ensure_rls` e `pgrst_*`, e os GRANTs. O Supabase self-hosted já traz os papéis e o `auth.jwt()`; o dump traz os GRANTs do `public`.

### Dados que o dump leva (referência de tamanho)
74 tabelas, ~22 MB no total. Empresas reais (HAT GROUP etc.), perfis ligados ao Clerk (`profiles.clerk_user_id`), assinaturas, vendas, agenda, chat.

---

## C. Papéis e permissões (conferir depois de restaurar)
```sql
-- esperado: authenticated executa ~123 funções do public; anon só 2
select grantee, count(*) from information_schema.routine_privileges
 where routine_schema='public' and grantee in ('anon','authenticated','service_role') group by 1;
-- todas as 74 tabelas com RLS ligado
select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relrowsecurity;
-- esperado: 106 políticas
select count(*) from pg_policies where schemaname='public';
```

---

## D. Arquivos do Storage
- Bucket: **`customer-documents`**, privado, limite 10 MB, tipos `application/pdf, image/jpeg, image/png, image/webp`.
- Políticas em `storage.objects` (3): inserir/ler/apagar **somente** quando a primeira pasta do caminho é uma `company_id` da qual o usuário é membro.
- **Hoje há 0 arquivos.** Se até a virada algum cliente enviar documento, baixe-os (painel Storage ou API) e eu recarrego no servidor novo; o caminho dos arquivos é `<company_id>/...`.

---

## E. Segredos e variáveis (só os NOMES; valores ficam no cofre)

Modelo pronto em **`env.servidor.exemplo`** (esta pasta). Resumo:

- **Mudam na virada (3):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → passam a apontar para `https://api.primeges.com.br` com as chaves do servidor novo.
- **NÃO mudam, mas têm de ser os MESMOS de hoje:** `TWO_FACTOR_ENCRYPTION_KEY` (senão o 2FA de todos quebra), `ANTIFRAUD_HASH_SECRET`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EVOPAY_API_KEY`, `EVOPAY_API_BASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`.
- **Chat AI:** `CHAT_AI_ENABLED=true`, `CHAT_AI_CONFIRM_ENABLED=true`, `CHAT_DAILY_LIMIT=200`.
- **No servidor do banco (arquivo `.env` do Supabase self-hosted):** `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, senha do painel, URLs públicas. **Faça 2 cópias fora da máquina.**
- **Remover na Vercel depois da virada:** a integração Vercel↔Supabase e as variáveis `POSTGRES_*`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET` (o código não usa).

---

## F. Configurações externas (checklist)

| Item | O que fazer | Quando |
|---|---|---|
| **Clerk** | **Nada muda no Clerk** (mesma instância `clerk.primeges.com.br`). Conferir que o token de sessão continua com o claim `role: authenticated` | Antes do ensaio |
| **Servidor novo ↔ Clerk** | Fazer a API do servidor aceitar os tokens do Clerk (JWKS de `https://clerk.primeges.com.br/.well-known/jwks.json`) | No ensaio |
| **EvoPay (webhook)** | Se o site continuar na Vercel, **nada muda** (`https://primeges.com.br/api/webhooks/evopay`). Só muda se o site sair da Vercel | Só se mudar o site |
| **DNS** | `api.primeges.com.br` → IP/túnel da máquina | Antes do ensaio |
| **Vercel** | Preview: trocar as 3 variáveis na branch de teste. Produção: **só na virada autorizada** | Ensaio / virada |
| **Banco TEST** (`zlmxbqlpjstmllrvafmy`) | Decidir: manter no Supabase ou criar um segundo banco na máquina | Antes do ensaio |
| **Resend (e-mail)** | Nada muda | — |
| **Domínio/e-mails do Supabase** | Remover integrações antigas depois dos 30 dias | Pós-virada |

---

## G. Provas que acompanham o pacote
- **30 arquivos SQL** em `tests/sql/` (isolamento entre empresas, financeiro, RH, assinaturas, 2FA, chat, permissões…). Rodar **todos** no banco novo e comparar: devem passar como passam hoje.
- **951 testes unitários** (`npm run test:unit`) e o CI.
- **Verificação de produção** (`scripts/verify-production.mjs`).

---

## Passo a passo de hoje (só preparo)

1. Preparar a máquina (arquivo `02_PREPARAR_A_MAQUINA.md`, seções 2 a 7).
2. Gerar o **pacote A** (bundle do código).
3. Montar o **cofre de segredos** (peça E) no gerenciador de senhas.
4. Combinar comigo **quando** gerar o **dump (B)** e para **onde** enviá-lo (por canal criptografado).
5. Me avisar o domínio, se a máquina está em casa ou data center, e o acesso por Tailscale (sem senhas no chat).

## Regras que seguimos na migração
- Nada em Produção sem o seu **"Autorizo"** explícito.
- Sempre **ensaio antes**, com cronômetro e teste de volta.
- O Supabase antigo fica **intacto por 30 dias** depois da virada.
- Cada mudança de banco entra como **arquivo versionado** no repositório (nunca "na mão").
- Nenhuma senha, chave ou `.env` trafega pelo chat.
