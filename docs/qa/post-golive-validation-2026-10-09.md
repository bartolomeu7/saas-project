# Prime Ges — Validação pós Go Live (2026-10-09)

Auditoria técnica executada **depois** do merge do PR #32 e do deploy de Production. Branch de trabalho:
`qa/post-golive-validation` (a partir de `origin/main` @ `3931854`). Nenhum dado de Production foi alterado
por esta auditoria; nenhuma migration nova, nenhum deploy, nenhuma variável de ambiente tocada.

Legenda: `VERIFIED` testado diretamente · `FAILED` testado e falhou · `BLOCKED` impossível por acesso/credencial/ambiente ·
`NOT VERIFIED` sem evidência suficiente · `INFERRED` conclusão indireta.

## A. Resumo executivo

**Veredito: `GO LIVE VALIDADO COM RESSALVAS`.**

- **Aprovado (VERIFIED):** código de `main` reproduz (lint 0 erros, typecheck, build, 45/46 testes); deployment de Production
  `dpl_CY5r6ajzya8eNUy1yZHpWRZSLyXs` (sha `3931854`) serve `primeges.com.br`; rotas públicas 200; rotas protegidas e as 11 de
  `/admin` redirecionam para `/login` sem sessão; HTTPS/HSTS ok; schema de Production == TEST (tabelas, colunas, constraints,
  enums, índices, policies, RLS, triggers, grants); 10 migrations registradas sem duplicata; bateria Admin/RBAC em TEST
  **298/299** (a única falha era erro de ordem do próprio teste, corrigido: product OK); consentimento **73/73** (inclui o cenário
  T10); billing no banco **24/24**; isolamento entre empresas **0 vazamentos em 39 tabelas**; anônimo bloqueado em RPCs/tabelas
  sensíveis em Production; Home/legal/menu mobile/FAQ sem erro de console nem overflow em 5 larguras; axe-core 0 violações
  (exceto 1, já corrigida na branch).
- **Falhou:** nada que impeça o uso. Defeito menor encontrado e **corrigido na branch** (contraste do link do Clerk em `/login`).
- **Bloqueado / não verificado:** todo o fluxo **autenticado em Production** (login, `/app`, `/admin` com sessão, T10 no navegador),
  EvoPay real (sem sandbox), logs de runtime da Vercel, logs do Supabase, configuração do dashboard do Clerk.
- **Riscos críticos:** nenhum bloqueador de segurança encontrado. Risco **jurídico/reputacional**: as páginas públicas exibem 26
  marcadores de pendência (`rc.2`).
- **Pronto para uso operacional?** Sim para o proprietário operar a plataforma (1 super_admin, 1 empresa, 0 assinaturas).
  **Não** para captar clientes pagantes até fechar: (1) dados jurídicos + revisão, (2) T10 manual, (3) smoke manual do Admin com
  sessão real, (4) primeiro pagamento real controlado no EvoPay.

## B. Matriz de testes (resumo; evidências nas seções seguintes)

| ID | Área | Cenário | Ambiente | Status |
|---|---|---|---|---|
| A-01 | Git | `main` contém `3931854`; `a7de5a1` é ancestral; working tree só com `b.txt` | repo | VERIFIED |
| A-02 | Deploy | deployment Production = sha `3931854`, alias `primeges.com.br`, `success` | Production | VERIFIED |
| A-03 | Migrations | 10 novas registradas, sem duplicata; 84/84 RPCs chamadas pelo código existem | Production | VERIFIED |
| A-04 | Drift | Production vs TEST: tabelas/colunas/constraints/enums/índices/policies/RLS/triggers/grants/assinaturas/EXECUTE idênticos | ambos | VERIFIED |
| A-05 | Drift | corpos de função: 24 diferem no texto bruto; todos iguais após normalizar comentários/formatação (7 legadas só com normalização forte) | ambos | VERIFIED |
| B-01 | Build | lint 0 erros (11 avisos preexistentes), tsc, build | local | VERIFIED |
| B-02 | Testes | `npm run test:unit`: 45 pass / 0 fail / 1 skip (opcional jurídico) | local | VERIFIED |
| B-03 | Segredos | diff do release e histórico recente sem segredos; sem refs a TEST em runtime | repo | VERIFIED |
| C-01 | Rotas | 7 públicas = 200; `/app*`, `/onboarding`, `/aceite-termos`, 11 `/admin*` = 307 → `/login?next=…` | Production | VERIFIED |
| C-02 | HTTPS | Let's Encrypt válido até 2026-11-21; HTTP→308; HSTS 2 anos; `nosniff`; `X-Frame-Options: DENY` | Production | VERIFIED |
| C-03 | Front | 5 larguras × 5 páginas: sem overflow, 1 `h1`, 1 `main`, 0 erros de console/hidratação | Production | VERIFIED |
| C-04 | UX | menu mobile (Sheet, Esc), FAQ, CTA → `/register`, skip target `tabindex=-1` | Production | VERIFIED |
| C-05 | A11y | axe-core em 10 varreduras: 1 violação serious (contraste `.cl-footerActionLink` em `/login`) | Production | FAILED → corrigido na branch |
| C-06 | A11y | após correção: `/login` 0 violações (375 e 1280) | local | VERIFIED |
| C-07 | CSP | sem `Content-Security-Policy` | Production | FAILED (hardening) |
| C-08 | DNS | `www.primeges.com.br` não resolve | Production | FAILED (config) |
| D-01 | Clerk | instância `production`, cadastro público, CAPTCHA on, senha mín. 15, sem social, consentimento nativo off, `terms_url`/`privacy_policy_url` vazios | Production (público) | VERIFIED |
| D-02 | Auth | login/logout/sessão/renovação/expiração em Production | Production | BLOCKED (sem sessão; senha proibida) |
| D-03 | Auth | middleware: sem `role=authenticated` → 503; erro de leitura → 503; `/admin` exige admin ativo; inativo/suspenso → bloqueio | código | VERIFIED (código) |
| D-04 | Auth | `ensure_profile` não recria/reativa (UNIQUE `clerk_user_id`, só devolve ativo); `profiles_select_own` não filtra status | Production (definições) | VERIFIED |
| D-05 | Auth | `unsafeMetadata` nunca usado como prova | código | VERIFIED |
| E-01 | Consent | bateria TEST 73/73: aceite, versão inválida, hash, histórico, imutabilidade, isolamento, suspenso | TEST | VERIFIED |
| E-02 | Consent | T10 cenário Production (aceite rc.1 → rc.2): pendente, reaceite, 4 registros, rc.1 preservada, idempotente, sem IP/UA | TEST | VERIFIED |
| E-03 | Consent | T10 no navegador em Production | Production | NOT VERIFIED (teste manual do proprietário) |
| E-04 | Consent | `/register` (TEST local): 2 checkboxes desmarcados, botão só com ambos, cookie `httpOnly` após envio, validação no servidor | TEST local | VERIFIED |
| E-05 | Consent | rc.2 vigente nos dois bancos, hashes == repositório | ambos | VERIFIED |
| E-06 | Consent | guard só em `layout`/`onboarding` (não em Server Actions/`/admin`) | código | VERIFIED (limitação) |
| F-01 | Admin/RBAC | bateria TEST 298/299 (+1 corrigida): usuários, empresas, acesso, pagamento manual, planos, auditoria, dashboard, ferramentas, integrações | TEST | VERIFIED |
| F-02 | Admin | páginas `/admin/*` logadas, filtros/paginação/"Último acesso" em Production | Production | NOT VERIFIED |
| G-01 | RBAC | usuário/admin/super/suspenso/anon por RPC e DML direto (41+16+12+… checks) | TEST | VERIFIED |
| G-02 | RBAC | último super_admin: não rebaixa/suspende/apaga nem via `service_role` | TEST | VERIFIED |
| G-03 | RBAC | concorrência: lock `platform_admin_roles` + revalidação (execução concorrente real não rodada) | código | VERIFIED (código) |
| G-04 | RBAC | **isolamento entre empresas: 39 tabelas `company_id`, SELECT/UPDATE/DELETE alheio = 0; 10 RPCs de empresa alheia negadas; funcionário não escala** | TEST | VERIFIED |
| G-05 | RBAC | anônimo em Production: RPCs admin/consent/presença `42501`; tabelas novas `401`; `profiles`/`audit_logs` `[]` | Production | VERIFIED |
| H-01 | DB | sem `auth.uid()`, sem FK para `auth.*`, sem `SECURITY DEFINER` sem `search_path`, todas as tabelas com RLS | Production | VERIFIED |
| H-02 | DB | `anon` tem INSERT/UPDATE/DELETE/TRUNCATE em todas as tabelas legadas (só RLS protege) | ambos | FAILED (hardening) |
| H-03 | DB | `plans_select_authenticated` = `true` (planos inativos legíveis por logados) | ambos | INFO |
| I-01 | Billing | mapper, referência, cliente HTTP (fetch simulado): 12 testes unitários | local | VERIFIED |
| I-02 | Billing | `confirm_subscription_payment`: duplicado, reentrega, fora de ordem, renovação 62 d, expirada→paga, permissões (24/24) | TEST | VERIFIED |
| I-03 | Billing | cobrança/webhook/pagamento **reais** | Production | BLOCKED (EvoPay sem sandbox) |
| I-04 | Billing | validação de valor do provedor × valor local | código | FAILED (não existe) |
| J-01 | Vercel | Preview falha por env incompleto (ver seção H) | Vercel | VERIFIED (causa) |
| K-01 | Perf | Home Production: LCP 288–444 ms, CLS 0, TTFB 66–128 ms (lab, sem throttling, 1 local) | Production | VERIFIED (lab) |
| K-02 | Logs | runtime Vercel / logs Supabase | — | BLOCKED / NOT VERIFIED |
| L-01 | Legal | 10 marcadores de dado + 16 de revisão ainda públicos em `rc.2` | Production | VERIFIED (pendência) |
| M-01 | Regressão | lint/tsc/unit/build pós-correção; smoke público; dados Production inalterados | local/Production | VERIFIED |

## C. Autenticação e consentimento

- Nenhuma sessão utilizável em Production (painel do navegador cai em `/login`); credenciais não foram solicitadas nem digitadas.
  Fluxos de login/logout/renovação/expiração: **BLOCKED**. Cobertura equivalente do servidor: middleware (código), RPCs com JWT
  simulado (`sub` + `role=authenticated`) em TEST, definições de `ensure_profile`/`current_profile_user_id` em Production.
- **T10 (reaceite rc.1 → rc.2)** — cenário reproduzido em TEST (`tests/sql/legal_consent.sql`, grupo `t10_prod`, 16 checks): usuário
  com aceite só da rc.1 fica `complete=false` com 2 pendências; aceitar com rc.1 ou mistura é rejeitado; reaceite grava 2 linhas;
  `complete=true`; repetir grava 0; histórico = 4 (rc.1×2 preservada + rc.2×2), contexto `REACCEPTANCE`, hash == publicado; UPDATE
  negado; sem coluna de IP/UA. **No navegador em Production permanece `NOT VERIFIED` até o seu teste manual.**
- Limitação conhecida (E-06): `requireLegalConsent()` roda em `(app)/layout.tsx` e `/onboarding`. Server Actions/rotas de API e
  `/admin` não consultam consentimento; um usuário sem aceite que chame uma ação diretamente não é barrado pelo consentimento
  (o acesso continua limitado por RLS/RPC). Recomendação: aplicar a checagem também no middleware ou nas RPCs de mutação.
- Como o Clerk Production permite cadastro público, quem chamar a API do Clerk direto cria conta sem passar pelo `/register`;
  essa conta cai em `/aceite-termos` e não usa o produto sem aceitar (documentado em `docs/legal-consent.md`).

## D. Admin e RBAC

- Páginas/ações cobertas por RPC em TEST (`tests/sql/admin_platform.sql`, 299 checks): dashboard, usuários (busca literal,
  filtros, paginação, ordenação inválida segura), detalhes, empresas, concessão/liberação de dias (limite configurável do admin),
  ajuste de vencimento e cancelamento (super), pagamento manual (validações, duplicidade de referência, anulação), troca de plano,
  CRUD de planos, auditoria (admin vê só o próprio; super vê todos; metadata sem segredos), ferramentas, integrações, presença,
  configurações (piso de 90 s), `direct_dml` (nenhuma escrita direta passa).
- Por papel: usuário comum 41/41 negados; admin 100% dentro do permitido e negado em ações de super; suspenso sem acesso; `anon` 12/12.
- Escalada: admin não muda papel, não suspende super, não edita super/outro admin; super não altera o próprio papel/status;
  último super_admin protegido até para `service_role`.
- **Não verificado em Production:** carregamento real das páginas com sessão, coluna "Último acesso", filtros/paginação com dados reais.
  A janela cosmética da migration 7 (coluna "Último acesso") deve ter sumido (código novo no ar); confirmar manualmente.

## E. Banco de dados

- Migrations de Production: `20261008185829 … 20261008202401` (10). TEST tem 16 versões no mesmo período (correções incrementais
  foram consolidadas nos arquivos do repositório); **o schema final é igual** (hashes por categoria idênticos).
- Funções: 24 corpos diferem no texto bruto (18 legadas preexistentes + 6 novas que carregam os comentários do repositório). Removendo
  comentários `--` e espaços, restam 7 legadas (`complete_sale`, `create_financial_entry`, `create_financial_entry_from_sale_payment`,
  `create_professional_block`, `pay_accounts_payable`, `receive_sale_payment`, `upsert_professional_profile`); com normalização mais
  forte (comentários de bloco, pontuação) as 7 ficam idênticas ao TEST. Nenhuma migration desta entrega toca essas funções.
- Resíduos: plano `TEST_R1` ("Teste financeiro R$1", **inativo, 0 uso**, criado em 2026-08-25) em Production — não removido.
- Advisors (Production): INFO tabelas RLS sem policy (esperado nas internas); WARN `SECURITY DEFINER` executáveis por `authenticated`
  (todas conferem autorização no corpo); `get_public_plans` e `get_current_legal_documents` por `anon` (públicas de propósito);
  WARN proteção de senha vazada do Supabase Auth desligada (Auth do Supabase não é usado; Clerk); WARN `auth_rls_initplan` em
  `profiles_select_own`; 2 índices duplicados (`audit_logs`, `subscription_payments`); 134 índices não usados (tabelas ainda vazias).

## F. Billing / EvoPay

- Preço sempre lido de `plans` no servidor; só owner/admin da empresa cria cobrança; confirmação sempre refeita no provedor
  (`GET /pix?id=`); decisão no banco com `FOR UPDATE` e idempotência por `event_id`; função restrita a `service_role`.
- Testado: duplicado, reentrega com outro `event_id`, `pending/expired/refunded` após `paid`, renovação empilhada (62,0 dias),
  expirada→paga, inexistente, eventos sem duplicata, permissões de `authenticated`/`anon`, expiração por data.
- **Lacunas (FAILED/limitação):** (1) sem comparação do valor do provedor com o valor local; (2) estorno/cancelamento depois de `paid`
  não reverte acesso (status fica `paid`); (3) `create-payment` não é idempotente (cada chamada cria uma cobrança Pix real); (4) sem
  rotina que expire cobranças pendentes antigas; (5) o webhook não é assinado (limitação do provedor) e registra uma linha em
  `webhook_deliveries` por id desconhecido (retenção de 60 dias limita o crescimento).
- **BLOCKED:** cobrança, webhook e pagamento reais — a EvoPay não oferece sandbox nem token de teste.

## G. Frontend e UX

- Rotas/breakpoints/console/hidratação/axe: ver matriz. Pendências: link do Clerk em `/login` (corrigido na branch), sem CSP,
  `www` não resolve, `terms_url`/`privacy_policy_url` do Clerk vazios, ícone `icon.png` de 767 KB.
- Performance (laboratório, sem throttling, um local, 3 amostras por viewport): LCP 288–444 ms, CLS 0, load 380–459 ms.
  Não representa usuários reais.

## H. Infraestrutura

- GitHub: `main` @ `3931854`; PRs #31/#32 mergeados; CI só roda em PR, usa **Node 20** e **não roda `test:unit`** (que exige Node ≥ 22).
- Vercel Production: deployment READY, alias `primeges.com.br`. Variáveis de Production (nomes, sem valores): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_live`), `CLERK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `EVOPAY_API_BASE_URL`, `EVOPAY_API_KEY` e as da integração Supabase. **Não definidas:** `NEXT_PUBLIC_APP_URL` (fallback seguro
  `https://primeges.com.br`; `/admin/integrations` mostra "não configurada") e `NEXT_PUBLIC_APP_ENV`.
- **Preview (`supabaseKey is required`)** — causa: no escopo Preview só existe `NEXT_PUBLIC_SUPABASE_URL` (compartilhada); anon key,
  chaves do Clerk e service role existem apenas em Production ou presas às branches `feat/clerk-auth-prep` e `feat/ui-revamp-shadcn`.
  Em qualquer outra branch o build falha no prerender de `/app/agenda`. Reproduzido localmente (anon key vazia → mesma falha) e
  também no preview do PR #31. É **configuração**, com um ponto de código: o build exige as variáveis no prerender.
  Procedimento seguro: criar variáveis de Preview **com credenciais de TEST** (Supabase TEST + Clerk Development), nunca as de Production.
- Logs de runtime da Vercel: não acessíveis pelas ferramentas disponíveis (só build). Logs do Supabase: esquema de tabelas não descoberto.

## I. Jurídico / LGPD

Estado: `1.0.0-rc.2` publicada (nada de `1.0.0`). Marcadores públicos hoje: **10 de dado empresarial, 16 de revisão jurídica.**

Dados que faltam (fornecer): razão social; CNPJ; endereço; e-mail de contato/suporte oficial; contato de privacidade e DPO (se houver);
foro competente; política de cancelamento/reembolso/direito de arrependimento (decisão comercial); prazos de retenção e eliminação
(incl. após encerramento); canal de atendimento aos direitos do titular (hoje exclusão/exportação são manuais).

Cláusulas para advogado: maioridade/poderes, responsabilidade pelo conteúdo e papéis controlador/operador, SLA/disponibilidade,
terceiros, limitação de responsabilidade, bases legais por finalidade, transferência internacional (banco nos EUA), cookies,
incidentes/ANPD, retenção, crianças/adolescentes.

Riscos de manter a rc.2 pública: texto com placeholders visíveis a visitantes e a quem aceitar; aceite registrado sobre texto não
final (o reaceite da versão final será necessário). Não declarar conformidade definitiva.

## J. Correções realizadas (branch `qa/post-golive-validation`)

| Arquivo | Motivo / causa raiz | Antes → depois |
|---|---|---|
| `src/components/shared/auth/clerk-auth-appearance.ts` | link do rodapé do Clerk: `#168BFF` sobre `#1B2633` a 13 px = 4,50:1, reprova no axe | 2 violações `serious` → 0 (375 e 1280) |
| `tests/sql/legal_consent.sql` | bateria presa à `rc.1`; faltava o cenário T10 de Production | 56 → 73 checks, todos passando em TEST |
| `tests/sql/admin_platform.sql` | check de `REF-B` rodava antes de a chamada que cria `REF-B` (falso negativo) | 298/299 → 299/299 (confirmado por mini-teste) |
| `tests/sql/billing_confirm.sql` (novo) | cobertura da confirmação de pagamento | 24/24 |
| `tests/sql/tenant_isolation.sql` (novo) | cobertura de isolamento entre empresas e escalada de papel de empresa | 0 vazamentos |
| `tests/unit/billing.test.mjs` (novo) | mapper, referência externa e cliente EvoPay (fetch simulado) | 12 testes |

Nenhuma migration, nenhuma mudança de dados, nenhum deploy. Para promover a correção do Clerk: PR da branch → merge → deploy.

## K. Dados e integridade

Production antes/depois desta auditoria: 2 perfis (1 `super_admin`, 1 `user`), 1 empresa, 6 planos, 0 assinaturas, 0 pagamentos,
0 eventos, 0 entregas de webhook, 0 auditorias, 0 consentimentos, 0 presença, 0 settings, 10 migrations. Resíduo de QA em
Production: 0. Todos os testes que escrevem rodaram em TEST dentro de transações revertidas por exceção forçada (nada persistiu).
Exceção: dois `execute_sql` com escrita em Production foram **negados** pelo classificador e não foram repetidos.

## L. Bloqueios e pendências

| Bloqueio | O que falta | Quem | Próximo passo | Risco se ignorar |
|---|---|---|---|---|
| Fluxos autenticados em Production | sessão de teste | proprietário | logar no painel do navegador e pedir a leitura de `/app`, `/admin/*` | falha de UI/sessão só vista por cliente |
| T10 em Production | teste humano | proprietário | `/app` → `/aceite-termos` → aceitar → `/app`; ver histórico | reaceite com bug para todos os usuários |
| EvoPay real | sem sandbox | proprietário/EvoPay | 1 cobrança real de baixo valor, controlada, com reembolso | falha de pagamento descoberta por cliente |
| Dados e revisão jurídica | dados da empresa + advogado | proprietário | enviar dados; publicar `1.0.0` (nova migration + hash) | exposição legal |
| Logs de runtime | acesso aos logs da Vercel/Supabase | proprietário | exportar/olhar erros 5xx pós-deploy | erros silenciosos |
| Dashboard do Clerk | conector não autenticado | proprietário | revisar URLs de termos/privacidade, e-mails, sessões | configuração divergente |

## M. Veredito final

**`GO LIVE VALIDADO COM RESSALVAS`.** Evidência: infraestrutura, banco, RBAC, isolamento entre empresas, consentimento, lógica de
billing e frontend público verificados diretamente; nenhuma falha de segurança ou integridade encontrada; um defeito de contraste
corrigido na branch. Ressalvas obrigatórias antes de captar clientes pagantes: testes autenticados em Production (D-02, E-03, F-02),
pagamento real controlado (I-03) e pendências jurídicas (L-01). Não é `GO LIVE VALIDADO` pleno porque esses itens críticos não
tiveram prova.

## N. Próximas ações (por prioridade)

1. **Segurança (hardening):** revogar `INSERT/UPDATE/DELETE/TRUNCATE` de `anon` nas tabelas legadas (nova migration, exige autorização);
   adicionar CSP; reavaliar `plans_select_authenticated`.
2. **Funcional crítico:** teste manual T10 e smoke do Admin com sessão (proprietário); revisar o consentimento em Server Actions.
3. **Integridade/billing:** validar valor do provedor × local em `confirm_subscription_payment`; reverter acesso em estorno/cancelamento
   pós-pago; idempotência em `create-payment`; expirar pendências antigas.
4. **Integrações bloqueadas:** primeiro pagamento real controlado; revisar dashboard do Clerk (URLs de termos/privacidade).
5. **Jurídico:** dados da empresa e revisão; publicar `1.0.0`.
6. **UX/infra:** `www`, ícone 767 KB, índices duplicados, Preview com credenciais de TEST, CI com Node ≥ 22 + `test:unit`.
7. **Melhorias:** `NEXT_PUBLIC_APP_URL`/`APP_ENV` na Vercel; remover `TEST_R1` quando autorizado.

### Checklist

- [x] Estado real do repositório/deploy/bancos reconfirmado · [x] qualidade local · [x] smoke público e protegido
- [x] schema Production == TEST · [x] RBAC/RLS/isolamento · [x] consentimento (TEST) · [x] billing no banco · [x] a11y pública
- [x] correção do contraste do Clerk (branch) · [x] relatório
- [ ] autenticação/Admin/T10 em Production · [ ] EvoPay real · [ ] logs de runtime · [ ] dados e revisão jurídica
- [ ] merge da branch de QA (decisão do proprietário)
