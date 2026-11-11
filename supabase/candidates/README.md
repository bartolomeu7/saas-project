# supabase/candidates

Arquivos SQL **candidatos, NÃO APLICADOS, que NÃO fazem parte da sequência executável**.
Ficam fora de `supabase/migrations/` (mesmo raciocínio de `supabase/superseded/`) para que nenhuma
ferramenta, script ou pessoa os execute por engano. **Nada aqui foi executado contra qualquer banco na
Fase 3** (a fase foi restrita ao repositório). Qualquer aplicação futura exige revisão e autorização
explícita, seguindo o procedimento controlado da seção 8 de `supabase/migrations/README.md`.

| Arquivo | O que é | SHA-256 (estado desta fase) |
|---|---|---|
| `20261014000400_commercial_write_gate.sql` | **CANDIDATA NÃO APLICADA — REQUER REVISÃO E AUTORIZAÇÃO.** Gate Integral de acesso comercial | `7f346352ca635e07a28ccfc6f5f36adedff3403b892da0e29935c178705b9796` |
| `20261014000400_commercial_write_gate.down.sql` | Rollback da candidata | `e58def2a92e30ecc13ac0f7e4d6c5e0631625ed16615d832890b8bac4af854ba` |
| `20261014000400_commercial_write_gate.test.sql` | Bateria SQL do gate (50 verificações; só em banco de teste descartável) | `068f7319291fe8dd689df75fa6f4c9fa29d01b8c86077b1a8f87746e227ea0e6` |
| `mission09.revised.sql` | Proposta de revisão da `tests/sql/mission09.sql` (remove o bloco do desenho rejeitado da `…000300`; 40 verificações). **Não substitui** a suíte oficial até um PR específico | `11c0905fb5ba514270dbed26c5fee4335ff22d5ed25f90145630c84bb35f0d9e` |

## Identificador

`20261014000400` é o próximo na série de prefixos `2026101400NN00` e **não existe em nenhum arquivo de
`supabase/migrations/` de nenhuma ref local ou remota-rastreada** (consulta feita em 2026-10-18; `git ls-tree`
em todas as refs). É uma **reserva** — a existência de um arquivo aqui não garante que o número permanecerá
livre; confira de novo antes de promover. Promoção (somente com autorização): `git mv` da migration para
`supabase/migrations/` e do `.down.sql` para `supabase/rollback/`, removendo o cabeçalho "CANDIDATA".

## O que o gate faz (resumo; leia o cabeçalho do SQL)

Um gatilho `BEFORE INSERT/UPDATE/DELETE … FOR EACH ROW` (`a0_commercial_write_gate`) em **36 tabelas**
(34 com `company_id` + `professional_availability` e `professional_services`) recusa a gravação de
**usuário final** (JWT `authenticated`, **membro** da empresa) quando a empresa não tem acesso comercial
vigente (`subscription_access_active`; carência 0 h). Leitura e exportação não são tocadas. Não bloqueia
`service_role`, conexões internas sem JWT, cascatas (`pg_trigger_depth() > 1`) nem as tabelas comerciais/
administrativas (`subscriptions`, `subscription_payments`, `company_entitlements`, `company_members`,
`audit_logs`, `platform_operation_keys`, `finance_default_seed_guard`). Não verifica `companies.status`
(decisão: sem bloqueio por empresa `inactive` até existir processo de suspensão). Não cria configurações.
Mensagem estável: `COMMERCIAL_ACCESS_REQUIRED: …` (SQLSTATE `P0001`, com `HINT`).

## Revisão técnica — o que está comprovado e o que não está

**VERIFIED nesta fase (leitura/análise estática do repositório, sem banco):**
- SQL completo e sem placeholders (busca por `TODO|FIXME|XXX|<versão>|PLACEHOLDER`: nenhuma ocorrência).
- Cobertura × repositório: varredura estática de `supabase/migrations/` em `origin/main` (6639727) encontra
  56 tabelas criadas, **41 com `company_id`** e 2 filhas por `professional_id`; a lista do gate (34) + as 7
  exclusões = exatamente as 41, e as 2 filhas coincidem; sem sobreposição nem duplicata.
- Funções auxiliares: `SECURITY DEFINER` (2 de 3) com `search_path = ''`, tudo qualificado por schema,
  `revoke all … from public, anon, authenticated`, `company_write_allowed` só para `service_role`; a própria
  migration falha (e reverte) se o nº de gatilhos ≠ 36, se alguma função auxiliar for executável por
  `anon/authenticated/PUBLIC` ou se existir tabela com `company_id` sem classificação.
- Dependências existem como código no repositório: `subscription_access_active` (`20261012000000`) e
  `current_profile_user_id` (`20261006000000`/`20261008010000`).
- Rollback coerente: remove os gatilhos pelo nome, as 3 funções e confere que não restou nada; não toca
  dados, policies, privilégios de tabela nem settings (a migration também não os altera).
- Correção incorporada em relação à primeira proposta: o gatilho só recusa quem é **membro** da empresa;
  não-membros seguem para a RLS (evita que um usuário descubra, por UUID, se outra empresa tem acesso
  comercial). Todas as políticas de escrita das tabelas gateadas exigem `company_members`.

**Evidência anterior à Fase 3, de outra missão, NÃO reexecutada aqui (INFERRED para o estado atual):**
instalação e bateria em um projeto Supabase de teste em 2026-10-17: 36 gatilhos; as 10 suítes de `tests/sql`
sem falhas; `…400.test.sql` 50/50; `mission09.revised.sql` 40/40; rollback restaurou a impressão digital do
catálogo; custo medido ≈ 0,27 ms por linha gravada no caminho completo (uma medição, ruidosa).

**NOT VERIFIED / BLOCKED:**
- **Compatibilidade com Production: NÃO testada** (a Fase 3 não acessa banco).
- PostgREST/`authenticator` reais (o gate trata `session_user = 'authenticator'` sem JWT como usuário —
  INFERRED), concorrência real e varredura exaustiva de RPCs.
- Storage (`storage.objects`) não é coberto; `TRUNCATE` e `UPDATE/DELETE` que afetam 0 linhas não disparam o
  gatilho por linha.
- **Tratamento no aplicativo: BLOCKED.** `git grep COMMERCIAL_ACCESS_REQUIRED` não encontra nada em `src/`,
  `tests/` ou `docs/`: hoje as Server Actions devolveriam mensagens genéricas ("Não foi possível salvar…") e o
  middleware já redireciona `/app/*` de empresas sem acesso (inclusive para leitura/exportação). Mensagem
  clara e fluxo de regularização exigem PR de aplicação separado, fora da Fase 3.
- Antes de qualquer instalação real: listar as empresas que passariam a ficar sem gravação (assinaturas
  vencidas/inexistentes) e decidir o tratamento; backup/ponto de restauração e comparação de catálogo ficam
  para a fase de aplicação, sob autorização.
- Desempenho: um gatilho que usa `to_jsonb(NEW)` + 2 consultas por linha pode pesar em importações em massa.
