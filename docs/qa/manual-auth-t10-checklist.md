# Checklist manual: login real, Admin e T10 (reaceite rc.1 → rc.2)

Quem executa: o dono (ou alguém com conta própria no **Clerk Development**). O agente não digita senhas nem cria contas no Clerk, então estes cenários continuam **NOT VERIFIED** até alguém marcar o resultado aqui.

Ambiente: **TEST apenas** — app local (`npm run dev` com `.env.local` apontando para o Supabase TEST e Clerk `pk_test_`) ou um Preview configurado como em `docs/ci-and-environments.md`. Nunca use a conta real de Production para este roteiro.

Antes de começar, confirme o banco de destino (nada de teste contra Production):

Confira que `NEXT_PUBLIC_SUPABASE_URL` do ambiente contém `zlmxbqlpjstmllrvafmy` (TEST) e **não** `fpbcruinppjbwtinzrdg` (Production) antes de entrar.

## A. Login, sessão e logout

| # | Passo | Esperado | Resultado |
|---|---|---|---|
| A1 | Abrir `/app` sem sessão | redireciona para `/login?next=%2Fapp` | |
| A2 | Entrar com a conta de teste | cai em `/app` (ou `/onboarding` se for conta nova), sem loop | |
| A3 | Recarregar a página várias vezes | continua logado; sem piscar para `/login` | |
| A4 | Sair (menu do usuário) | volta para público; `/app` volta a redirecionar para o login | |
| A5 | Voltar com o botão "voltar" do navegador após sair | não exibe dados do app | |

## B. Primeiro acesso (conta nova) e perfil

| # | Passo | Esperado |
|---|---|---|
| B1 | Cadastro em `/register` marcando os dois aceites | `/aceite-termos` confirma automaticamente (contexto `SIGNUP`) e segue para `/onboarding` |
| B2 | Verificar no TEST (somente leitura) | 1 linha em `profiles` para o `clerk_user_id` e 2 em `user_consents` |

```sql
select p.user_id, p.status, p.role from public.profiles p where p.email = '<e-mail-da-conta-de-teste>';
select c.document_type, v.version, c.document_hash, c.context, c.granted_at
  from public.user_consents c join public.legal_document_versions v on v.id = c.document_version_id
 where c.user_id = '<user_id acima>' order by c.granted_at;
```

## C. T10: reaceite de rc.1 para rc.2

Pré-condição: conta de teste com aceite da **rc.1** (cadastrada antes de a rc.2 ser publicada, ou aceite rc.1 inserido em TEST por quem tem permissão).

| # | Passo | Esperado | Resultado |
|---|---|---|---|
| C1 | Entrar com a conta que só tem rc.1 | redireciona para `/aceite-termos?next=…`, sem loop | |
| C2 | Tentar abrir `/app/vendas` direto | volta para `/aceite-termos` (barreira central) | |
| C3 | Aceitar os dois documentos | segue para o destino original; sem loop | |
| C4 | Conferir no banco | 2 novas linhas `user_consents` (contexto `REACCEPTANCE` ou `ACCEPTANCE_GATE`) com versão `1.0.0-rc.2` e `document_hash` **igual** ao publicado; as linhas da rc.1 continuam lá | |
| C5 | Reabrir `/app` | entra direto, sem nova tela de aceite | |

```sql
select c.document_type, v.version, c.document_hash, c.context, c.granted_at
  from public.user_consents c join public.legal_document_versions v on v.id = c.document_version_id
 where c.user_id = '<user_id>' order by c.granted_at;
-- hashes esperados da rc.2 (document_hash):
--  TERMS_OF_USE    62ade40650d70b490835e8eebc94917eca7554b733cf91d2e9096400cba9cb69
--  PRIVACY_POLICY  d43afbdf5a04c5f3258ad394b6a6824758f6f00860d0729cfbd67a756ced3bc9
```

Ação de servidor sem aceite (opcional, valida a barreira para não-página): com a conta ainda sem aceite rc.2, abrir a aba Rede do navegador, tentar uma ação do app (por exemplo salvar um cliente) e confirmar resposta **403** com `{"code":"LEGAL_CONSENT_REQUIRED"}` em vez de a ação executar.

## D. Admin e RBAC (conta com papel `admin` e outra `super_admin` em TEST)

| # | Conta | Passo | Esperado |
|---|---|---|---|
| D1 | usuário comum | abrir `/admin` | redireciona/nega (não é administrador) |
| D2 | admin | abrir `/admin`, listar usuários e empresas | abre; vê dashboard e listas |
| D3 | admin | tentar alterar papel, configurações da plataforma ou criar plano | botão ausente ou erro `not authorized` |
| D4 | admin | conceder 7 dias a uma empresa de teste, com motivo | sucesso; aparece em auditoria |
| D5 | super_admin | alterar papel de um usuário de teste e voltar | sucesso; ações na auditoria |
| D6 | super_admin | tentar rebaixar/suspender a si mesmo | recusado |
| D7 | suspenso | entrar com usuário suspenso | acesso bloqueado, sem loop |

Não altere o papel ou o status do **último super_admin** de Production em nenhum momento.

## Registro

Preencha a coluna "Resultado" (PASS/FAIL + data) e anexe prints. Só depois disso T10 e a autenticação real podem sair de **NOT VERIFIED** no relatório.
