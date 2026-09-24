# supabase/migrations

Migrations SQL versionadas do banco de dados — única forma permitida de
alterar o schema (nunca diretamente pelo dashboard do Supabase). Cobrem hoje
toda a fundação (profiles, multi-tenant, customers) e os módulos de negócio
implementados: billing/assinatura (EvoPay), produtos, serviços, vendas,
fidelidade, documentos de cliente e Caixa (migration 021). Ver `docs/architecture.md` para a visão
geral de cada módulo.


## Governança de migrations

Toda migration deve entrar no repositório por branch e Pull Request vinculada a um GitHub Issue. A PR deve informar impacto, compatibilidade com o código atual e estratégia de rollback/contingência quando aplicável.

Fluxo obrigatório: **Issue → migration + código em branch → CI/validação → PR → merge em `main` → deploy → health check**.

Nunca usar alteração manual no dashboard do Supabase como substituto do histórico versionado. Consulte [`docs/github-governance.md`](../../docs/github-governance.md).
