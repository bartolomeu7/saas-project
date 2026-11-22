# Auditoria do que foi implantado, alterado e migrado — Prime Ges (18 a 21/10/2026)

Relatório para revisão externa. Escrito por Claude (Claude Code) a pedido do dono do projeto. Tudo abaixo foi conferido contra o Git, o GitHub, o banco de produção (somente leitura) ou o site no ar. Onde algo **não** foi verificado, está dito.

## 1. Contexto

- Produto: **Prime Ges**, SaaS brasileiro de gestão para pequenos negócios (padarias, lava-rápidos etc.). Next.js 16 (App Router), Clerk (autenticação), Supabase/Postgres (dados, RLS, RPCs), Vercel (hospedagem, deploy automático da `main`), EvoPay (cobrança Pix).
- Repositório: `bartolomeu7/saas-project`, branch `main`. Produção: Supabase `fpbcruinppjbwtinzrdg`. Teste (TEST): Supabase `zlmxbqlpjstmllrvafmy` ("primeges-TESTE-isolado"). Site: https://primeges.com.br.
- Objetivo do período: (a) deixar GitHub e Supabase de produção sincronizados; (b) aplicar a trava do teste grátis; (c) atender a uma lista de 17 itens jurídicos/LGPD/segurança; (d) colocar em Go Live o que fosse possível, com pendências anotadas.
- Regra de trabalho: nada em produção sem autorização explícita do dono, por etapa. O classificador automático do Claude Code **negou** aplicações em produção quando a autorização era genérica ("pode colocar tudo online", "Continua") e só liberou depois da frase explícita citando as migrations e o PR. Nenhuma negação foi contornada.

## 2. Linha do tempo (horários de Brasília; PRs em UTC no GitHub)

| Quando | O que aconteceu |
|---|---|
| 18/10 | Fase de preparação da sincronização: consulta somente leitura ao histórico de migrations de produção, matriz arquivo × histórico (70 arquivos × 78 entradas). **PR #35** (somente documentação) mesclado. |
| 20/10 à noite | Segredo antifraude (`ANTIFRAUD_HASH_SECRET`) corrigido na Vercel pelo dono (estava "curto/fraco"; recriado e redeploy). Migration `000200` aplicada em produção. **PR #36** (documentação) mesclado. |
| 21/10 madrugada | Auditoria dos 17 itens jurídicos/LGPD no site no ar (axe-core, headers, caminhos sensíveis). Rascunhos dos textos legais. |
| 21/10 manhã | **PR #38** (segurança: Next.js 16.3.8) mesclado e verificado no ar. |
| 21/10 manhã | Exclusão de conta construída e validada no TEST. **PR #39** aberto, CI verde. |
| 21/10 ~08:36 | Aplicadas em produção `account_self_deletion` e `legal_rc3`; **PR #39** mesclado; deploy verificado. |

## 3. Estado final de produção (conferido em 21/10, somente leitura)

- Banco: **81 migrations** no histórico (eram 78 antes de 20/10). Últimas:
  - `20261021113708 legal_rc3` (1347 bytes, md5 `eb0e6d65…`)
  - `20261021113639 account_self_deletion` (9563 bytes, md5 `e7d56d02…`)
  - `20261021015349 trial_requires_authorization` (2481 bytes, md5 `5d9e0897…`)
  - `20261016214156 session_gate_and_trial_hardening`, `20261016213958 plans_management_and_usage_limits` (aplicadas antes, em 16/10)
- Dados: 2 perfis, 1 empresa, 0 contas anonimizadas, 0 linhas em `retained_billing_records`, 0 em `trial_signup_events`.
- O gate comercial (gatilho `a0_commercial_write_gate`) **não** está em produção (só no TEST).
- `main` = `625cb14` (merge do PR #39). Deploy de produção ativo contém tudo abaixo.

## 4. O que foi feito, item a item

### 4.1 Sincronização GitHub × Supabase (18 a 20/10)
- Reconciliação por conteúdo, somente leitura. Resultado: 12 arquivos idênticos byte a byte, 44 equivalentes sem comentários/espaços, 11 com diferença textual conhecida, `013` consolidada, `000200` e `000300` ausentes em produção. A versão registrada no histórico difere do prefixo do arquivo **por desenho** (a versão é o horário de aplicação).
- A leitura de produção usou `set local transaction_read_only = on` em cada chamada (comprovado: um `CREATE TEMP TABLE` foi recusado com erro 25006). A impressão digital oficial do catálogo (`tests/sql/catalog-fingerprint.sql`) permaneceu igual, exceto `fn_body` depois da `000200`.
- `20261014000300` (RLS parcial, 18 tabelas) está **substituída/incompleta e não deve ser aplicada**.
- PRs #35 e #36: só documentação (`supabase/migrations/README.md`, `docs/plans-and-usage-limits.md`).

### 4.2 Migration `20261014000200_trial_requires_authorization` — APLICADA em produção
- Faz `create or replace` de `create_company_with_owner()` para conceder o teste grátis somente via `grant_free_trial_internal()` (exige autorização do servidor, que grava um hash do IP em `trial_signup_events`).
- Pré-requisitos cumpridos antes: código com `authorizeTrialSignup()` já implantado; `ANTIFRAUD_HASH_SECRET` válido (≥32 caracteres variados) configurado na Vercel e validado em `/admin/settings` ("Segredo dedicado configurado"; o valor nunca foi lido).
- Pós-checagem: texto idêntico ao arquivo (md5), corpo da função igual ao esperado, dono/`search_path`/permissões inalterados, fingerprint mudou só em `fn_body`, dados intactos.
- **Não verificado:** cadastro real em produção (conta nova → empresa → teste concedido). Depende do dono.
- Efeito colateral de falha segura: segredo ausente/fraco → o cadastro funciona, mas **sem** teste grátis.
- Rollback: `supabase/rollback/20261014000200_trial_requires_authorization.down.sql`.

### 4.3 Segurança (PR #38, no ar)
- `next` 16.3.7 → **16.3.8** (patch). Corrige os avisos de severidade alta do `npm audit` no próprio Next.js (cache poisoning SSG/ISR, SSRF no otimizador de imagens, vazamento de Draft Mode, metadata image routes). `poweredByHeader: false` (some `X-Powered-By: Next.js`).
- Verificado em cópia limpa com `npm ci`: build ok, `tsc` ok, 165 testes passando; depois no ar: cabeçalho removido, páginas 200.
- `npm audit --omit=dev`: de 9 para 8 avisos. Restam 3 grupos, **só ferramentas de build** (braces/fast-glob/micromatch, postcss-selector-parser, source-map-js). Corrigir exige atualização maior do Tailwind (não feito).
- Sondagem do site no ar (somente leitura): `.env`, `.git/config`, `package.json`, source maps → 404/403; `/app` e `/admin` → 307 para login; HSTS presente; X-Frame-Options DENY; nosniff; Referrer-Policy; Permissions-Policy.
- Webhook EvoPay (`/api/webhooks/evopay`) **não é assinado** (limitação do provedor). Mitigação existente: o payload nunca decide o status; o servidor refaz um `GET` no provedor antes de gravar.

### 4.4 Textos legais `1.0.0-rc.3` (PR #39, no ar)
- **Termos de Uso** e **Política de Privacidade** reescritos a partir do comportamento real do sistema: bases legais (LGPD art. 7º), retenção, antifraude (hash HMAC do IP, 30 dias por padrão), sessões simultâneas, transferência internacional (art. 33; Res. CD/ANPD nº 19/2024), decisões automatizadas (art. 20), incidentes (art. 48), CDC (foro do consumidor, limitação de responsabilidade), direitos do titular completos (art. 18, prazo de 15 dias do art. 19, limites do art. 16, ANPD).
- **Reembolso/cancelamento** dentro dos Termos: arrependimento de 7 dias com devolução de 100% (CDC art. 49), outros casos de reembolso, como pedir, resposta em 5 dias úteis, estorno por Pix em **10 a 15 dias úteis**.
- Duas páginas públicas **derivadas das seções aceitas** (mesma fonte, mesmo hash; `getRefundPolicyDocument()` e `getDataRightsDocument()` em `src/lib/legal/documents.ts`): `/politica-de-reembolso` e `/direitos-do-titular`. Links no rodapé.
- Registro no banco (`legal_rc3`): `rc.2` → `retired`; `rc.3` → `published`, `effective_at = 2026-10-21T00:00:00-03:00`. Hashes SHA-256: Termos `744998c56f925fe1c4068620b4aaeb4fc10be84fee4cc3d7cf1704fc02e1f8b9`, Política `5aeb29bf9c46cfff309c74d0daf262a5cf025242050db9844eff427f17b6c2d8`. O teste T12 (`tests/unit/legal.test.mjs`) confere hash do texto × hash da migration.
- Conferido no ar: versão `1.0.0-rc.3`, "21 de outubro de 2026", impressão digital exibida (`744998c56f925fe1…`, `5aeb29bf9c46cfff…`) = hash do banco. `get_current_legal_documents()` devolve exatamente as duas `rc.3`.
- **Consequência intencional:** todos os usuários (inclusive o dono) têm o aceite pendente e serão levados a `/aceite-termos` no próximo acesso.
- **Irreversível:** a tabela só permite `published → retired`. A `rc.2` não volta. Qualquer correção é uma versão nova (`rc.4`).
- Marcadores `[VALIDAÇÃO JURÍDICA NECESSÁRIA]`: de 7 para 0 (os textos assumem as decisões). Marcadores `[BLOCKED — DADO EMPRESARIAL NECESSÁRIO]`: **11 ainda no ar** (razão social, CNPJ, endereço, e-mails de contato/suporte/privacidade, encarregado de dados, foro). Decisão do dono: publicar assim e completar na `rc.4`. A página mostra um aviso "versão de desenvolvimento" enquanto houver marcador.
- Os textos são proposta técnica, **não parecer jurídico**. Revisão por advogado não foi feita.

### 4.5 Exclusão da própria conta (PR #39, no ar; migration `account_self_deletion` aplicada)
Tela: `/conta` ("Privacidade e segurança", link no menu do usuário), **fora** do layout `/app` de propósito (funciona com assinatura vencida, aceite pendente ou limite de sessões). Despedida: `/conta-excluida` (pública, sem dado pessoal).

Banco (`supabase/migrations/20261022000000_account_self_deletion.sql`, rollback em `supabase/rollback/`):
- `account_deletion_preview(uuid)` (leitura) e `delete_account_data(uuid)` (escrita), `SECURITY DEFINER`, `search_path = public, pg_temp`, `EXECUTE` **somente** para `service_role` (conferido em produção: `anon`/`authenticated`/`PUBLIC` sem acesso).
- Nova coluna `profiles.anonymized_at` e nova tabela `retained_billing_records` (RLS ligada, sem acesso de `anon`/`authenticated`).
- Regras: admin/super_admin da plataforma **não** se exclui; quem é o **único owner** de empresa que ainda tem outras pessoas **não** exclui (precisa transferir/remover antes); empresa em que a pessoa é a única → a empresa e todos os dados saem por cascata; empresa com outras pessoas → só o vínculo sai; o **perfil não é apagado**, vira registro anônimo (sem nome, e-mail, foto, vínculo Clerk, status `inactive`); preferências, presença e vagas de sessão são apagadas; cobranças pagas são copiadas para `retained_billing_records` **sem nome/documento do pagador**, por 5 anos; aceite dos Termos (`user_consents`, append-only) é preservado; auditoria grava `account.self_deleted` só com contagens.
- Por que o perfil não é apagado: `user_consents` e registros criados pela pessoa em empresas que continuam (vendas, caixa) apontam para ele por FK sem cascata.

Aplicação (Next.js, `src/lib/account/actions.ts`): a Server Action usa o **id da sessão** (nunca do formulário), exige digitar `EXCLUIR`, consulta a prévia, apaga do Storage os arquivos (`customer-documents`) das empresas que serão excluídas, chama `delete_account_data`, remove o usuário no Clerk (`users.deleteUser`) e tenta enviar e-mail.
- **E-mail de confirmação: desligado** (decisão do dono de pular o Resend; o Clerk não envia e-mail arbitrário, conferido na documentação). A tela final avisa que nenhum e-mail foi enviado. Ativar = `RESEND_API_KEY` + `EMAIL_FROM` na Vercel.
- Middleware: `/conta` entra em `PROTECTED_PREFIXES` (exige login); `robots.ts` bloqueia `/conta` e `/conta-excluida`.

Verificação:
- **Banco (TEST, transação revertida): 37 de 37** (`tests/sql/account_deletion.sql`): dono sozinho, funcionário, co-dono, sem empresa, bloqueios, cobrança retida sem pagador, aceite preservado, permissões (`authenticated`/`anon` negados).
- Unitários: 182 passam, 0 falham, 1 pulado (o teste opcional `LEGAL_REQUIRE_PUBLISHABLE=1`, que falha de propósito enquanto houver `[BLOCKED]`). `tsc`, eslint e `next build` limpos. axe-core (WCAG 2.1 A/AA): 0 violações em `/politica-de-reembolso`, `/direitos-do-titular` e `/conta-excluida`.
- No ar: `/conta` sem login → 307 para `/login?next=/conta`.
- **NÃO verificado:** o fluxo logado real (clique em excluir → banco → Storage → Clerk). Exige uma conta descartável no Clerk. Também não foi testado o aceite novo (`rc.3`) com usuário real.

## 5. Arquivos principais tocados (todos em `main`)
- Conteúdo legal: `src/content/legal/privacy-policy.ts`, `terms-of-use.ts`; `src/lib/legal/documents.ts`; páginas `src/app/(public)/politica-de-reembolso`, `direitos-do-titular`; rodapé `src/components/marketing/site-footer.tsx`.
- Exclusão: `src/lib/account/{deletion-core,email-content,email,actions}.ts`; `src/components/account/delete-account-panel.tsx`; `src/app/conta/page.tsx`; `src/app/conta-excluida/page.tsx`; `src/components/app/user-menu.tsx`; `src/middleware.ts`; `src/app/robots.ts`; `.env.example`.
- Banco: `supabase/migrations/20261021100000_legal_rc3.sql`, `20261022000000_account_self_deletion.sql`; rollback `supabase/rollback/20261022000000_account_self_deletion.down.sql`.
- Testes: `tests/unit/account-deletion.test.mjs`, `tests/unit/legal.test.mjs` (T12 ajustado), `tests/sql/account_deletion.sql`.
- Segurança: `next.config.js`, `package.json`, `package-lock.json`.
- Docs: `docs/go-live-pendencias.md`, `supabase/migrations/README.md` (seção 3-E).

## 6. Pontos que merecem olhar crítico (riscos e inconsistências conhecidas)

1. **Ordem de operações da exclusão.** A Server Action apaga os arquivos do Storage **antes** da transação do banco. Se o banco falhar depois (raro, pois a prévia já validou), os arquivos já teriam sumido e as linhas ficariam. Há mensagem "Nada foi apagado" nesse caso, o que então seria impreciso para os arquivos. Alternativa a considerar: marcar para remoção e apagar os arquivos depois do commit.
2. **Falha no Clerk depois do banco.** Se `deleteUser` falhar, os dados já foram apagados e só é registrado em log; a pessoa ainda consegue fazer login e o `ensure_profile` criaria um perfil novo e vazio. Sem fila de repetição.
3. **Comentário desatualizado no SQL aplicado.** O cabeçalho da migration `account_self_deletion` ainda diz "RASCUNHO: ainda NÃO aplicada em Production". O texto aplicado é idêntico ao arquivo (decisão: não editar para manter a igualdade com o histórico). O README (seção 3-E) ainda a descreve como candidata; precisa de uma atualização de documentação.
4. **PR #37.** Aparece como "MERGED" no GitHub porque seus commits entraram pelo #39; ele nunca foi mesclado isoladamente.
5. **Textos legais com campos em branco no ar** (11 `[BLOCKED]`) e sem revisão de advogado.
6. **Compromissos operacionais assumidos nos textos** que o negócio precisa conseguir cumprir: responder titulares em 15 dias; estorno em 10 a 15 dias úteis; cópia dos dados manual; acordos de proteção de dados com Supabase, Vercel, Clerk e EvoPay (art. 33) **não foram verificados**; não existe rotina de expurgo de `retained_billing_records` após 5 anos; **não há fluxo automático de pedido de reembolso** (depende do e-mail de atendimento, ainda em branco).
7. **Bloqueio comercial no banco (gate)** existe só no TEST. Em produção, quem está com assinatura vencida é barrado só pelo aplicativo (middleware). O app ainda não trata o erro `COMMERCIAL_ACCESS_REQUIRED`. A única empresa de produção está com o teste vencido desde 17/10.
8. **Sem CSP** (decisão antiga: exige teste dedicado; sugerido começar em modo "só relatório"). Sem `security.txt` (precisa do e-mail de contato).
9. **Navegação 100% por teclado** não foi testada de ponta a ponta (só o link "Pular para o conteúdo" e axe).
10. **TEST ≠ produção em um ponto:** o TEST tem o gate instalado; produção não. Os testes de exclusão rodaram no TEST com o gatilho de limite de vagas desligado só dentro da transação revertida.

## 7. Ações do Claude que não fazem parte do produto (transparência)
- Uma requisição `POST` com corpo `{"x":1}` ao webhook de produção, só para observar a resposta (200 `{received:true}`; sem `id`, nada é gravado).
- Sondagens `GET`/`HEAD` ao site no ar (headers, caminhos sensíveis, páginas).
- Cópia temporária do `.env.local` do checkout principal para o worktree para compilar e rodar localmente (arquivo ignorado pelo Git; removido ao final). Junção (`mklink /J`) de `node_modules` entre worktrees.
- Todas as execuções de escrita no TEST foram transações que terminam em erro proposital (`RESULT: {json}`), sem persistir nada.
- Em produção, as **únicas** escritas do período foram: a `000200` (autorizada), `account_self_deletion` e `legal_rc3` (autorizadas pela frase explícita do dono). O resto foi leitura com `transaction_read_only`.

## 8. Pendências anotadas (também em `docs/go-live-pendencias.md`)
- Dados da empresa → gerar `rc.4` (texto novo → migration de registro → deploy juntos → reaceite).
- Revisão por advogado.
- Teste real da exclusão de conta com conta descartável; teste do aceite `rc.3`.
- Cadastro real em produção para confirmar a concessão do teste grátis.
- E-mail de confirmação (Resend), se o dono quiser.
- Gate comercial em produção (decisão sobre a empresa com teste vencido + tratamento do erro no app).
- CSP em modo relatório; `security.txt`; teste de teclado; atualização do Tailwind para zerar o `npm audit`.
- Atualizar o README das migrations (item 6.3) e criar rotina de expurgo de `retained_billing_records`.
