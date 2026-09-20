# supabase/migrations

Migrations SQL versionadas do banco de dados — única forma permitida de
alterar o schema (nunca diretamente pelo dashboard do Supabase). Cobrem hoje
toda a fundação (profiles, multi-tenant, customers) e os módulos de negócio
implementados: billing/assinatura (EvoPay), produtos, serviços, vendas,
fidelidade e documentos de cliente. Ver `docs/architecture.md` para a visão
geral de cada módulo.
