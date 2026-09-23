# Fase 2 — RPC, RBAC, Governança e Integridade

Data: 2026-09-23

## Escopo executado

### Supabase
- `20260923115135_phase2_rpc_rbac_governance_hardening`
  - remove privilégios Data API de `payment_events` e `finance_default_seed_guard`;
  - bloqueia INSERT/UPDATE/DELETE direto em `audit_logs`;
  - troca políticas RLS de `public` para `authenticated`;
  - move `postgres_fdw` de `public` para `extensions`;
  - adiciona auditoria transacional a inclusão, alteração de papel e remoção de colaboradores.
- `20260923115406_phase2_rls_initplan_hardening`
  - transforma chamadas de `auth.uid()` em políticas RLS para o padrão de avaliação por init-plan.
- `20260923115529_phase2_loyalty_rbac_hardening`
  - restringe a escrita de configurações, multiplicadores e faixas de fidelidade a `owner/admin`.

### GitHub
Branch: `fix/phase2-rpc-rbac-governance`

Arquivos alterados:
- `src/lib/audit/log.ts`
- `src/lib/settings/actions.ts`
- `src/types/supabase.ts`
- `supabase/migrations/20260923115135_phase2_rpc_rbac_governance_hardening.sql`
- `supabase/migrations/20260923115406_phase2_rls_initplan_hardening.sql`

## Correções relevantes

1. Auditoria
A aplicação não tenta mais gravar `audit_logs` diretamente com o client autenticado. O helper server-side valida que o ator pertence à empresa e grava com client administrativo controlado.

2. Configurações
Corrigida a sintaxe de `VALID_DENSITIES` e o registro de auditoria das configurações foi redirecionado para o logger confiável.

3. Tabelas internas
`payment_events` e `finance_default_seed_guard` continuam protegidas por RLS, mas agora também não possuem INSERT/SELECT via Data API para `anon`/`authenticated`.

4. RBAC de equipe
As três operações críticas de equipe agora geram auditoria dentro do RPC que executa a alteração.

5. Políticas
Não existem mais políticas com role `public` no schema público.

6. SECURITY DEFINER
O inventário dos RPCs expostos confirmou que as funções de negócio chamadas por usuários autenticados usam `auth.uid()`, isolamento por empresa e `search_path` fixado em `public`. Os avisos restantes do Advisor correspondem principalmente a RPCs de negócio que precisam de SECURITY DEFINER e serão tratados individualmente quando houver motivo para remover a elevação.

## Verificações

- 0 políticas RLS usando role `public`.
- INSERT em `audit_logs` por `authenticated`: bloqueado.
- Acesso `authenticated` a `payment_events`: removido.
- `postgres_fdw`: schema `extensions`.
- Advisor de performance: alerta de init-plan RLS removido.
- Escritas de `loyalty_settings`, `loyalty_multipliers` e `loyalty_tier_thresholds`: somente `owner/admin`.
- Permanecem 34 FKs sem índice de cobertura e 96 índices marcados como não utilizados; não foram alterados nesta etapa porque isso exige validação por caminho real de consulta antes de criar/remover índices.

## Drift conhecido

As migrations de banco 024, 025 e 026 ainda existem no histórico do Supabase, mas não estão presentes no repositório GitHub. A branch histórica `feat/phase2-purchases-receiving-payables` também termina no migration 023, então não foi inventado SQL histórico. Este item continua pendente para reconstrução/reconstituição controlada.

## Regra operacional

Nenhum deploy ou alteração no Vercel faz parte desta fase.