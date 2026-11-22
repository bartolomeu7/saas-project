# api

Route Handlers que precisam rodar fora do fluxo de Server Actions (ex:
webhooks de pagamento, que são chamados pelo provedor externo, não pelo
próprio app).

- `billing/create-payment/route.ts` — cria a cobrança Pix na SyncPay (ou a reserva do pagamento por cartão).
- `billing/pay-card/route.ts` — cobra o cartão com o token de uso único do iFrame da SyncPay.
- `webhooks/syncpay/route.ts` — recebe o webhook `transaction` da SyncPay (assinatura HMAC conferida no corpo cru) e confirma o
  pagamento (ver `docs/SYNCPAY_INTEGRACAO.md` e `docs/architecture.md`, seção "Pagamentos").
