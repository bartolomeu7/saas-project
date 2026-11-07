# Configurações: conta, segurança, aparência e empresa (06/11/2026)

## O que existe

| Onde | Quem | O que faz |
|---|---|---|
| `/app/configuracoes` (visão geral) | todos | atalhos; só leitura |
| `/app/configuracoes/perfil` | todos | nome, foto, e-mails (adicionar/confirmar/principal/remover), telefone (SMS) |
| `/app/configuracoes/seguranca` | todos | nível de segurança, senha, verificação em duas etapas (Google Authenticator + códigos de backup), aparelhos conectados |
| `/app/configuracoes/aparencia` | todos | tema escuro / claro / automático (só neste aparelho) |
| `/app/configuracoes/empresa` | dono e administrador da empresa | nome e segmento |
| `/admin/account` | qualquer administrador da plataforma | seu acesso, perfil, segurança, tema; atalhos extras para super admin |
| `/admin/settings` | super admin | já existia; ganhou o bloco "Minha conta de administrador" |

A conta (nome, foto, e-mail, telefone, senha, aparelhos) fala direto com o Clerk pelo navegador, com interface própria.
A **verificação em duas etapas é do próprio Prime Ges** (não do Clerk, cujo plano gratuito não oferece MFA): ver seção abaixo. Ações sensíveis passam pela reverificação do Clerk (`useReverification`). Depois de mudar nome,
foto ou e-mail, `syncProfileFromClerkAction` copia os dados, lidos do Clerk no servidor, para `public.profiles`
(só e-mail já verificado; nunca role nem status).

## Banco

Migration `20261106000000_company_self_edit.sql`: função `update_own_company(p_name, p_business_type)`.
Só dono/administrador da empresa atual; usa `current_profile_user_id()`; não mexe em status nem plano; audita em
`audit_logs` (`company.updated`). Sem policy nova. Bateria: `tests/sql/company_self_edit.sql` (17 testes, só no TEST).
Rollback: `supabase/rollback/20261106000000_company_self_edit.down.sql`.

## Verificação em duas etapas própria (TOTP)

O Clerk continua provando QUEM é a pessoa. A segunda etapa é uma camada do produto: quem ativou digita o código do
Google Authenticator (ou um código de backup) **uma vez por sessão do Clerk** para usar `/app`, `/admin` e `/conta`.

- **Onde barra:** no middleware (`src/lib/security/two-factor/gate.ts`), como o aceite dos termos e o limite de sessões:
  páginas redirecionam para `/verificacao-2fa`; Server Actions e APIs recebem 403 `TWO_FACTOR_REQUIRED`. Sem a função no
  banco (deploy antes da migration) o middleware libera e registra em log; erro de leitura fecha (503).
- **Segredo:** TOTP (RFC 6238, SHA-1, 6 dígitos, 30 s, tolerância ±1 passo) com a biblioteca `otpauth`; cifrado com
  AES-256-GCM (o id do usuário entra como dado autenticado) antes de ir ao banco. Códigos de backup: 10, só o HMAC-SHA256.
- **Chave:** variável de ambiente `TWO_FACTOR_ENCRYPTION_KEY` (32 bytes em base64), no Vercel. **Sem ela o recurso fica
  indisponível (a tela mostra "sendo liberado") e ninguém é bloqueado.** NUNCA remova nem troque a chave depois que
  houver usuários com a segunda etapa ativa: eles não conseguiriam mais verificar (a recuperação é o reset por super admin).
- **Força bruta:** `two_factor_reserve_attempt()` reserva cada tentativa no banco, de forma atômica, antes de conferir:
  5 erradas = bloqueio de 15 min, mesmo com pedidos simultâneos. O mesmo código do app não vale duas vezes (`last_used_step`).
- **Tabelas** (`user_two_factor`, `user_two_factor_backup_codes`, `two_factor_session_verifications`): sem policy e sem
  privilégio para usuário; só `service_role` (Server Actions).
- **Recuperação:** super administrador remove a segunda etapa de OUTRA pessoa em `/admin/users/[id]` (`admin_reset_two_factor`,
  audita; nunca em si mesmo). Excluir a própria conta apaga o segredo e os códigos.
- **Migration:** `20261107000000_two_factor.sql`; rollback `supabase/rollback/20261107000000_two_factor.down.sql`;
  bateria `tests/sql/two_factor.sql` (só no TEST).
- **Não cobre:** quem chama o Supabase direto com o próprio JWT (fora do Next) não passa pelo middleware; o isolamento
  entre empresas segue pela RLS. A segunda etapa não protege a tela de login do Clerk em si, e sim o acesso ao produto.

## Telefone (Clerk)

Cadastrar telefone depende de o Clerk ter o atributo ligado (hoje desligado) e pode ter custo de SMS. Senha: o Clerk
exige no mínimo 15 caracteres (a tela já avisa).

## Tema claro

Opcional e só na área logada. O padrão e todas as páginas públicas continuam escuros. A paleta clara está no `:root`
de `globals.css`; `tests/unit/design-tokens.test.mjs` confere os contrastes (texto 4,5:1, bordas de campo 3:1).
Telas conferidas no claro: Configurações. Os demais módulos usam os mesmos tokens, mas ainda precisam de revisão visual.

## Não coberto por teste automático

Fluxos reais do Clerk (trocar senha, e-mail, SMS, reverificação), a ativação da segunda etapa com o aplicativo
autenticador de verdade e a gravação da empresa em Produção: dependem de login real e só podem ser conferidos no site
publicado.
