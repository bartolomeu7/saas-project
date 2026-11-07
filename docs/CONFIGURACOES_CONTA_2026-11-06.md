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

A conta (nome, foto, e-mail, telefone, senha, duas etapas, aparelhos) fala direto com o Clerk pelo navegador, com
interface própria. Ações sensíveis passam pela reverificação do Clerk (`useReverification`). Depois de mudar nome,
foto ou e-mail, `syncProfileFromClerkAction` copia os dados, lidos do Clerk no servidor, para `public.profiles`
(só e-mail já verificado; nunca role nem status).

## Banco

Migration `20261106000000_company_self_edit.sql`: função `update_own_company(p_name, p_business_type)`.
Só dono/administrador da empresa atual; usa `current_profile_user_id()`; não mexe em status nem plano; audita em
`audit_logs` (`company.updated`). Sem policy nova. Bateria: `tests/sql/company_self_edit.sql` (17 testes, só no TEST).
Rollback: `supabase/rollback/20261106000000_company_self_edit.down.sql`.

## Configuração do Clerk (produção) necessária

Sem isto os botões aparecem, mas o Clerk recusa:
- **Verificação em duas etapas**: `auth_multi_factor.authenticator_app.enabled = true`.
- **Códigos de backup**: `auth_multi_factor.backup_code.enabled = true`.
- **Telefone**: `auth_phone` com verificação por código SMS (pode ter custo/limite no plano do Clerk).
- Senha: o Clerk exige no mínimo 15 caracteres (a tela já avisa).

## Tema claro

Opcional e só na área logada. O padrão e todas as páginas públicas continuam escuros. A paleta clara está no `:root`
de `globals.css`; `tests/unit/design-tokens.test.mjs` confere os contrastes (texto 4,5:1, bordas de campo 3:1).
Telas conferidas no claro: Configurações. Os demais módulos usam os mesmos tokens, mas ainda precisam de revisão visual.

## Não coberto por teste automático

Fluxos reais do Clerk (trocar senha, QR/código, SMS, reverificação) e a gravação da empresa em Produção: dependem de
login real e foram conferidos só no site publicado.
