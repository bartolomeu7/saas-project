# api

Route Handlers que precisam rodar fora do fluxo de Server Actions (ex:
webhooks de pagamento, que são chamados pelo provedor externo, não pelo
próprio app).

- `billing/create-payment/route.ts` — cria uma cobrança Pix na EvoPay.
- `webhooks/evopay/route.ts` — recebe e valida o webhook de confirmação de
  pagamento da EvoPay (ver `docs/architecture.md`, seção "Pagamentos").
