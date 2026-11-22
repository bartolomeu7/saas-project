# MisticPay — gateway de pagamento (Pix)

Segundo gateway das assinaturas, ao lado da SyncPay ([SYNCPAY_INTEGRACAO.md](SYNCPAY_INTEGRACAO.md)). O super administrador escolhe
qual deles recebe as **novas** cobranças em **/admin/integrations → Gateway de pagamento ativo**. Padrão: MisticPay (a SyncPay fica
pausada até a conta dela liberar o Pix pela API). Documentação do provedor: <https://docs.misticpay.com> (`/llms.txt` traz tudo em texto).

## Como funciona

| Etapa | O que acontece |
|---|---|
| Cobrança | `POST https://api.misticpay.com/api/transactions/create` com `amount` (reais), `payerName`, `payerDocument` (só dígitos), `transactionId` (= id do pagamento no Prime Ges), `description` e `projectWebhook` (nossa URL com token). Resposta: `data.transactionId` e `data.copyPaste` (Pix copia e cola; o QR Code é gerado no servidor a partir dele). |
| Aviso de pagamento | A MisticPay faz `POST` em `https://primeges.com.br/api/webhooks/misticpay?token=…`. |
| Confirmação | O servidor **não confia no aviso**: consulta `POST /api/transactions/check` com a chave secreta e usa o **estado e o valor da resposta**. Só `COMPLETO` com valor igual ao do plano (ao centavo, conferido no banco) libera o acesso. |
| Contingência | Botão “Já paguei” (a partir de 10 s, no máximo 30 consultas por pagamento), “Reverificar” e “Reconciliar pendentes” no painel admin usam a mesma consulta. |

Por que o token na URL: **a MisticPay não assina os webhooks** (a documentação não descreve assinatura nem segredo). O token
(`MISTICPAY_WEBHOOK_TOKEN`, conferido em tempo constante) impede que terceiros disparem consultas; mesmo com o token vazado, um
aviso forjado não libera nada, porque quem decide é a consulta à API. O token é gerado uma vez e não precisa ser cadastrado no painel
da MisticPay (a URL vai junto de cada cobrança).

Mapeamento de estados: `COMPLETO` → pago · `PENDENTE` → pendente · `FALHA` → falhou · `CANCELADO` → cancelado · `DEVOLVIDO` → estornado ·
`DEVOLVIDO_PARCIAL` e desconhecidos → ignorados (nunca concedem acesso). Saques (`RETIRADA`) e infrações MED recebidos no webhook são
ignorados — **não há suspensão automática de acesso por MED** (igual à SyncPay).

## Configuração (uma vez)

1. No painel da MisticPay: **API → Chaves de Acesso → Criar Chave de Acesso** (pede 2FA). Marque **só** os escopos `TRANSACTION_CREATE` e
   `TRANSACTION_READ`. O `sk_…` aparece **uma única vez**.
2. Em `E:\primeges-local\site.env` preencha `MISTICPAY_CLIENT_ID` (`pk_…`) e `MISTICPAY_CLIENT_SECRET` (`sk_…`). `MISTICPAY_WEBHOOK_TOKEN`
   já foi gerado. **Nunca** cole o `sk_` em chat, repositório ou print.
3. **API → IPs autorizados**: se a lista tiver algum IP, inclua o IP de saída do servidor (hoje 186.225.179.80, doméstico: pode mudar). Lista
   vazia aceita qualquer IP, mas sem proteção.
4. Recriar o container web para ler as variáveis (`docker compose up -d web`).
5. Em **/admin/integrations** o cartão da MisticPay deve sair de “Sem credenciais”. Teste com um plano de R$ 1,00 (não há sandbox).

## Pendências e riscos conhecidos (não verificáveis sem uma cobrança real)

- **CNPJ**: a documentação diz “Documento **CPF** do pagador”. Empresas com CNPJ podem ser recusadas (`VALIDATION_ERROR`); o motivo exato
  fica nas observações do pagamento (/admin/payments). Se recusar, decidir entre pedir o CPF do responsável ou outro gateway.
- **Identificador**: o webhook de exemplo traz o id numérico da MisticPay; o de reembolso, o `transactionId` do cliente. A rota aceita os
  dois (busca pelo id gravado e, se for um UUID, pelo id do pagamento) e a consulta tenta os dois identificadores.
- **Unidade do valor**: o `check` documenta reais (`value: 1.12`); a criação devolve `transactionAmount: 455` (centavos). O código compara o
  valor do `check` em reais: se a conta devolver centavos, a confirmação é **recusada com AMOUNT_MISMATCH** (nunca concede errado) e aparece
  no painel — corrigir então.
- **Retentativas**: a documentação não diz se a MisticPay repete o webhook em caso de erro. Se perder um aviso, “Já paguei” e “Reconciliar
  pendentes” confirmam pela consulta.
- **Taxa**: a MisticPay desconta `fee` do saldo da conta; o plano é cobrado pelo valor cheio.

## Banco (migration `20261122100000_misticpay_gateway.sql`)

- `platform_settings.payment_gateway` (texto) + `get_active_payment_gateway()` (padrão `misticpay`) e `set_active_payment_gateway()` (só
  super admin, auditada em `platform.settings.updated`).
- `claim_gateway_payment(..., p_provider)`: reserva idempotente por empresa + plano + **gateway** + forma; índice único
  `subscription_payments_one_open_charge_idx` (substitui o da SyncPay). A MisticPay só aceita Pix.
- `confirm_subscription_payment` aceita `misticpay`; integrações, reconciliação e resumo do painel enxergam a MisticPay.
- Reversão: `supabase/rollback/20261122100000_misticpay_gateway.down.sql`.

Testes: `tests/sql/misticpay_gateway.sql` (44/44), `tests/sql/syncpay_gateway.sql` (43/43), `tests/unit/misticpay-webhook.test.mjs`,
`tests/unit/misticpay-client.test.mjs`.
