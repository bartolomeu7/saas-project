# supabase/superseded

Arquivos SQL **que não fazem parte da sequência executável** de migrations.
Ficam aqui, fora de `supabase/migrations/`, para que nenhuma ferramenta (CLI,
script, pessoa) os execute por engano.

| Arquivo | Situação |
|---|---|
| `004_billing_foundation.sql` | Rascunho de billing **nunca aplicado** no Supabase. **Substituído por** `supabase/migrations/009_billing_subscriptions.sql`. Executá-lo antes da 009 produziria um schema de billing incorreto (enums e tabelas com desenho diferente do live). Mantido apenas como referência histórica; conteúdo inalterado. |

Não aplicar. Não renumerar. Ver `supabase/migrations/README.md` (seção 4).
