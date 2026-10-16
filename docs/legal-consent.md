# Documentos legais e consentimento

Status: implementado e validado **somente em TEST**. Nada disto foi aplicado em Production.

## O que existe

| Peça | Onde |
|---|---|
| Texto dos documentos (versionado no Git) | `src/content/legal/terms-of-use.ts`, `privacy-policy.ts` |
| Hash SHA-256 do texto publicado | `src/lib/legal/hash.ts` |
| Páginas públicas | `/termos-de-uso`, `/politica-de-privacidade` |
| Registro de versões publicadas | tabela `legal_document_versions` |
| Histórico de aceites (append-only) | tabela `user_consents` |
| RPCs | `get_current_legal_documents`, `get_my_legal_consent_status`, `record_legal_consent`, `get_my_legal_consent_history` |
| Aceite no cadastro | `/register` (dois checkboxes, validados no servidor) |
| Aceite obrigatório / reaceite | `/aceite-termos` + guarda em `(app)/layout.tsx` e `/onboarding` |
| Migration | `supabase/migrations/20261010000000_legal_consent.sql` |
| Testes | `tests/unit/legal.test.mjs`, `tests/sql/legal_consent.sql` |

## Modelo de dados

- `legal_document_versions`: `document_type` (`TERMS_OF_USE` | `PRIVACY_POLICY`), `version`, `effective_at`, `content_hash`, `status` (`draft` | `published` | `retired`).
  Versão publicada é **imutável** (trigger): não muda hash, versão nem vigência, e não pode ser apagada; só pode passar de `published` para `retired`.
- `user_consents`: um registro por documento e por aceite, com `consent_type` (`TERMS_OF_USE_ACCEPTANCE` ou `PRIVACY_POLICY_ACKNOWLEDGEMENT`), `document_version_id`, `document_hash`, `granted`, `granted_at` (relógio do servidor) e `context` (`SIGNUP`, `REACCEPTANCE`, `ACCEPTANCE_GATE`).
  **Append-only** (trigger para UPDATE, DELETE e TRUNCATE, valendo até para o dono do banco). Aceite dos Termos e ciência da Política são registros separados.
- Não há consentimento de marketing no modelo (a constraint o recusa). Se existir no futuro, será um tipo separado, opcional e revogável, sem efeito sobre o acesso ao produto.
- **IP e user-agent não são gravados**: não há finalidade documentada que justifique a coleta. Reavaliar com o jurídico antes de mudar.

Nenhuma das duas tabelas é aberta ao cliente: RLS ligada, sem policy e sem grant. Só as RPCs acessam.
Única RPC executável por `anon`: `get_current_legal_documents` (informação pública: versões vigentes).

## Como a versão vigente é decidida

Documento vigente = versão `published` com `effective_at <= now()` e vigência mais recente.
A RPC `record_legal_consent(p_terms_version, p_privacy_version, p_context)`:

1. identifica o usuário **só** pelo JWT (`current_profile_user_id()`); não aceita `user_id`;
2. recusa se as versões informadas não forem as vigentes (o cliente apenas confirma o que viu);
3. grava os dois aceites que faltarem, com o hash da versão vigente e a hora do servidor;
4. é idempotente (repetir não duplica) e serializada por usuário.

O servidor ainda confere a integridade antes de gravar: o hash do texto do repositório precisa ser igual ao `content_hash` publicado no banco para a mesma versão. Se não for (texto mudou sem nova versão), **nenhum aceite é gravado** e a tela mostra "documentos em atualização".

## Fluxo do cadastro

1. `/register` mostra os dois checkboxes (desmarcados). A Server Action `startSignupAction` valida no servidor que os dois vieram marcados e que as versões batem, e emite o cookie `pg_legal_intent` (httpOnly, 1 h, assinado com HMAC derivado de `CLERK_SECRET_KEY`).
2. Só com o cookie válido a tela renderiza o `<SignUp/>` do Clerk (mantido como está).
3. No primeiro acesso do usuário novo, `/aceite-termos` troca o cookie pelo registro definitivo (`confirmSignupConsentAction`, contexto `SIGNUP`). O token só serve a usuário **criado depois** da emissão e dentro da janela; é descartado ao ser usado. Se algo falhar, a tela cai no aceite explícito.
4. `unsafeMetadata` do Clerk **não** é usado nem é prova. A prova é a linha gravada pelo servidor.

Limitação conhecida: sem ligar a opção nativa do Clerk ("Require express consent to legal documents", no dashboard), alguém que chame a API do Clerk diretamente consegue criar a conta, mas ela **não usa o produto** sem aceitar (guarda no layout). A opção nativa guarda só um carimbo de data, sem versão nem separação.

## Reaceite (usuários existentes e novas versões)

### Barreira central (Missão 07)

A guarda agora é **central**, no `src/middleware.ts`, e decidida por uma função pura (`src/lib/legal/gate.ts`, testada em `tests/unit/consent-gate.test.mjs`). Para usuário autenticado com perfil ativo, em `/app`, `/onboarding`, `/admin` e `/api/billing`, o middleware chama `get_my_legal_consent_status()`:

| Situação | Resultado |
|---|---|
| consentimento vigente completo | segue |
| pendente + página (GET/HEAD) | redireciona para `/aceite-termos?next=…` (destino sanitizado por `safeAfterConsentPath`) |
| pendente + Server Action, API ou método não-GET | `403` JSON `{ "code": "LEGAL_CONSENT_REQUIRED" }` — a ação **não executa** |
| erro do banco ao consultar | `503` (fail closed), nunca libera |
| sem perfil (primeiro acesso) / perfil suspenso | não consulta (o fluxo normal já trata) |

Fora da barreira de propósito: páginas públicas e legais, `/aceite-termos`, `/login`, `/register`, `/api/webhooks` (chamada do provedor, sem sessão) e `/api/presence` (heartbeat de 60 s que só grava o horário; gatear dobraria as leituras do banco). O `requireLegalConsent()` dos layouts continua como segunda camada.

**Limite conhecido:** quem chama o PostgREST do Supabase diretamente com o próprio JWT não passa pelo Next. O isolamento entre empresas e a RLS continuam valendo (provado em `tests/sql/tenant_isolation.sql`); o consentimento é evidência jurídica, não fronteira de segurança dos dados.

Antes da Missão 07 a guarda só rodava em carregamento completo de página (layout), então Server Actions de um usuário com a sessão aberta e o `/admin` não eram cobrados.

## Publicar uma nova versão de um documento

1. Edite o texto em `src/content/legal/*.ts` **e** aumente `version` (e `effectiveAt`, se for o caso).
2. Calcule o hash: `hashLegalDocument(doc)` (veja `tests/unit/legal.test.mjs`).
3. Nova migration: insira a nova linha em `legal_document_versions` (e, se quiser, `update ... set status = 'retired'` na anterior). **Nunca** edite a linha publicada.
4. `npm run test:unit` confirma que o hash da migration bate com o texto.
5. Quem tiver o aceite da versão anterior passa a ser pendente e verá `/aceite-termos`; o histórico antigo permanece.

## Antes de Production

- Resolver todos os marcadores `[BLOCKED — DADO EMPRESARIAL NECESSÁRIO]` e `[VALIDAÇÃO JURÍDICA NECESSÁRIA]` (`LEGAL_REQUIRE_PUBLISHABLE=1 npm run test:unit` falha enquanto existirem).
- Publicar versão final (`1.0.0`), com novo hash e nova migration. As versões `1.0.0-rc.*` existem só para TEST: a `rc.1` está aposentada e a `rc.2` (migration `20261010000100_legal_rc2.sql`, mesmo texto, só o rótulo mudou) foi publicada para exercitar o reaceite.
- Aplicar a migration em Production **antes** do deploy do código (o guarda falha fechado se as RPCs não existirem).
- Ordem de rollout completa do pacote da Missão 07 (cada passo exige autorização própria): (1) `20261011000000_billing_hardening.sql` e `20261011000100_privilege_minimization.sql` em Production — a primeira **remove** a assinatura antiga de `confirm_subscription_payment` e o código novo exige `claim_subscription_payment`; (2) só então deploy do código; (3) smoke e T10 manual. Subir o código antes das migrations quebra a criação de cobrança; aplicar as migrations sem o código novo quebra a confirmação de pagamento (assinatura antiga).
- Checklist de dados e perguntas jurídicas: `docs/legal/final-publication-checklist.md`.
- Revisão jurídica de ambos os documentos (bases legais, papéis controlador/operador, prazos de retenção, transferência internacional, foro).
