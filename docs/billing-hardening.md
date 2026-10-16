# Billing: proteção financeira (Missão 07)

Migration: `supabase/migrations/20261011000000_billing_hardening.sql` — aplicada **somente em TEST**. Production ainda tem 71 migrations (a última é `20261008202401`) e nenhuma cobrança, evento ou consentimento.

## Problemas reproduzidos em TEST antes da correção

1. Era possível inserir várias cobranças `pending` da mesma empresa e plano (duplo clique ou duas abas geravam duas cobranças Pix).
2. Uma confirmação com valor divergente (R$ 1,00 numa cobrança de R$ 89,00) liberava o acesso completo.
3. Estorno não era detectável: pagamento já `paid` retornava cedo e nunca era reconsultado.
4. A confirmação não validava que o evento pertencia à cobrança.

## Desenho

**Criação idempotente** (`claim_subscription_payment`, só `service_role`). Valida plano ativo, preço, duração e moeda; exige `amount == preço do plano`; serializa por `pg_advisory_xact_lock('billing_claim:<empresa>:<plano>')`; reaproveita a cobrança aberta; reserva em andamento (menos de 120 s) devolve a mesma sem criar outra; reserva velha vira `failed`. Índice único parcial `subscription_payments_one_open_evopay_charge_idx (company_id, plan_id) where provider='evopay' and status='pending'` é a segunda barreira. A rota `create-payment` só chama o provedor se o claim devolveu `created` sem cobrança; depois confere `amountsMatch(plan.price, charge.amount)` e, se divergir, marca `failed` e responde 502 **antes** de existir QR.

**Confirmação** (`confirm_subscription_payment`, 7 argumentos, só `service_role`):

- evento duplicado (`unique provider,event_id`) é ignorado; evento de outra cobrança → `EVENT_PAYMENT_MISMATCH`;
- `paid` exige cobrança no provedor (`NO_PROVIDER_CHARGE`), valor informado (`AMOUNT_MISSING`) e igual ao da cobrança até o centavo (`AMOUNT_MISMATCH`), plano com duração fixa (`PLAN_NOT_BILLABLE`);
- com `paid` aceito: trava por empresa, marca pago e chama `platform_apply_access` (único escritor do acesso);
- `paid → refunded` é aceito e **não revoga o acesso automaticamente** (decisão de negócio: revogar é ação do admin); `refunded` é terminal (`REFUNDED_TERMINAL` para qualquer `paid` posterior);
- status igual ou `pending` atrasado são ignorados; rejeições **não** marcam o evento como processado e geram auditoria `subscription_payment.confirmation_rejected`.

**Verdade vem do provedor:** o webhook da EvoPay não é assinado, então a rota só usa o evento como gatilho e confirma por `GET /pix?id=` servidor-a-servidor (`confirmPaymentFromProvider(id, { recheckPaid: true })`).

**Diagnóstico** (`platform_diagnostics()`, agora 13 verificações): + `refunded_with_access` e `payment_events_unprocessed`.

## Evidência (TEST)

| Bateria | Resultado |
|---|---|
| `tests/sql/billing_confirm.sql` | 69/69 |
| `tests/sql/admin_platform.sql` | 299/299 |
| `tests/sql/tenant_isolation.sql` | 0 vazamentos em 39 tabelas |
| `tests/unit/billing.test.mjs` | 17 testes (mapper, referência, centavos, cliente HTTP com fetch simulado) |

## Contrato EvoPay (documentação oficial, consultada em 2026-10-09 — Missão 07.1)

Fonte: https://docs.evopay.cash (guia: introdução, webhooks, schemas; referência: `GET/POST /v1/pix`). Nenhuma cobrança real foi feita.

| Ponto | Documentado | Como o código trata |
|---|---|---|
| Unidade do valor | "sempre em reais decimais. R$ 10,50 = 10.50 — nunca em centavos" | `toCents()` converte reais para centavos inteiros; o banco recebe reais com 2 casas |
| Campo do valor | `amount` (number) no GET e no webhook; é o valor bruto (`amountWithTax = amount − taxAmount` é o líquido) | compara `amount` com o preço do plano, nunca o líquido |
| Moeda | **não** é devolvida (Pix = BRL) | fixada em BRL no servidor |
| Referência externa | enviada na criação, **não** devolvida no GET nem no webhook | localiza o pagamento por `provider_transaction_id`, nunca pela referência |
| Status | PENDING, COMPLETED, CANCELED, WAITING_FOR_REFUND, REFUNDED, EXPIRED; fluxo COMPLETED → WAITING_FOR_REFUND → REFUNDED | mapeados em `mappers.ts`; WAITING_FOR_REFUND continua `paid`, REFUNDED é terminal |
| Webhook | payload `{id,type,status,amount,endToEndId,payerDocument,payerName}`; **sem assinatura**; **uma única tentativa, sem reenvio**; idempotência por `id + status` | só usa o `id`; confirma por `GET /pix?id=`; event_id = `id:status` |
| Pagamento parcial / a mais | **não documentado** | qualquer valor diferente do esperado é rejeitado (`AMOUNT_MISMATCH`) |
| Sandbox | **não existe** | contrato só verificável com uma cobrança real |

Inconsistência da própria documentação: o schema `Transaction` cita `taxValue/taxType`, enquanto a resposta de criação cita `taxAmount/amountWithTax`. O cliente trata esses campos como opcionais e eles não participam de nenhuma decisão de acesso.

Testes: `tests/unit/evopay-contract.test.mjs` (exemplos oficiais, parcial, a mais, centavos×reais, ilegível, status desconhecido) e `tests/sql/billing_confirm.sql`.

**Continua NOT VERIFIED:** que a resposta real do `GET /pix` traz `amount` exatamente como documentado. Validar com uma cobrança de valor mínimo autorizada pelo dono (a criação já rejeita `amount` diferente do plano antes de existir QR).

## Compatibilidade de versões e ordem de implantação (Missão 07.1)

Como a migration muda assinaturas, foi testada a convivência em TEST (`tests/sql/billing_compat_old_code.sql`):

| Combinação | Resultado provado |
|---|---|
| **Código antigo (publicado) + banco novo** | A chamada antiga de 6 argumentos nomeados resolve para a função nova (7º argumento tem default). O valor é lido do payload do provedor **só se for JSON number**; ausente, divergente ou em texto → rejeitado. Criação antiga (INSERT direto) duplicada falha com `unique_violation` (seguro, não duplica); planos diferentes na mesma empresa continuam permitidos. |
| **Código novo + banco antigo** | `create-payment` falha (RPC `claim_subscription_payment` inexistente) e a confirmação falha (assinatura nova inexistente): nada é cobrado nem concedido. |

Ordem segura: **(1) migrations em Production, (2) deploy do código.** Na janela entre os passos o código antigo continua confirmando pagamentos corretos e recusando os incorretos; a única regressão visível é a de "pagar de novo" com cobrança aberta (erro seguro em vez de segunda cobrança). Antes de aplicar, rode `select count(*) from subscription_payments where status='pending'` em Production: com cobranças pendentes duplicadas a migration as cancela (hoje há 0 pagamentos).

## Rollback (testado em TEST)

Scripts: `supabase/rollback/20261011000100_privilege_minimization.down.sql` e `supabase/rollback/20261011000000_billing_hardening.down.sql` (fora de `supabase/migrations` de propósito; executar como postgres, nesta ordem).

Prova (TEST, transação revertida; gerador em `tests/sql/build-rollback-test.mjs`): snapshot de ACL (tabelas, colunas, funções, privilégios padrão) = 877 entradas, digest `c2c9718c4974c4d19a4dddbfba6a93a3`. **Depois de aplicar os dois rollbacks o TEST tem digest idêntico ao de Production** (que ainda não recebeu as migrations), e reaplicar as migrations devolve o digest do estado atual. Ou seja: o rollback é exato para privilégios e assinaturas de função.

Não é revertido: cobranças pendentes duplicadas já canceladas pela migration e eventos de pagamento gravados. O corpo antigo de `platform_diagnostics` (11 verificações) está no script de rollback, mas sua execução não foi exercitada pela prova de ACL. Rollback do **código**: reimplantar o deployment anterior (funciona com o banco revertido; funciona também com o banco novo, ver tabela acima).

## Limitações e riscos residuais (não esconder)

- **Concorrência real NÃO verificada.** As chamadas paralelas do MCP são serializadas (provado em 2026-10-09: a segunda sessão só começou depois que a primeira liberou o lock; `dblink` foi negado pelo ambiente). A garantia vem de lock advisory + índice único (índice e fluxos testados em série). `tests/integration/billing-concurrency.mjs` (S1–S10: mesma intenção, intenções distintas, reserva abandonada, claim×confirmação, webhook duplicado, estorno concorrente) está pronto e **BLOCKED**: exige a service-role key de TEST em `.env.local` (hoje vazia).
- **EvoPay:** semântica real do valor não provada (ver acima). Falha fechada: a primeira cobrança real pode ser rejeitada por formato inesperado; o evento fica não processado (`payment_events_unprocessed`) e o admin pode registrar o pagamento manualmente.
- **Webhook com uma única tentativa:** se a entrega falhar e o pagador fechar a página, o acesso só sai por "Já paguei", reverificação do admin (ou o poller enquanto a página está aberta). Não há reconciliação agendada; recomendação: job periódico que reconsulta cobranças pendentes recentes (fora do escopo desta missão).
- Estorno não revoga acesso automaticamente (decisão de negócio; diagnóstico `refunded_with_access`).
- Dados do pagador ficam em `payment_events.payload` (questão jurídica em `docs/legal/final-publication-checklist.md`).
