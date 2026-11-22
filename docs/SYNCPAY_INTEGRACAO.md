# Gateway de pagamento: SyncPay (Pix e cartão)

Data: 21/11/2026. Substitui a EvoPay. Fonte: documentação oficial da SyncPay (https://docs.syncpayments.com.br, índice em `/llms.txt`), lida inteira em 21/11/2026.

**Modelo mantido:** cobrança *avulsa* que concede N dias de acesso (plano `access_duration_days`), renovada manualmente pelo cliente. Não é a assinatura recorrente da SyncPay (planos/adesões com cobrança automática): isso fica para uma 2ª etapa.

## Como funciona

### Pix
1. Cliente escolhe o plano → `POST /api/billing/create-payment` `{planId, method:"pix"}`.
2. O servidor lê o preço do plano **no banco**, reserva a cobrança (`claim_gateway_payment`, idempotente) e chama `POST /cash-in` da SyncPay com o comprador (nome, CPF/CNPJ, e-mail, telefone — do cadastro da empresa).
3. A tela mostra o QR Code (gerado no servidor a partir do `pix_code`) e o "copia e cola".
4. O cliente paga; a SyncPay chama o **webhook** → acesso liberado.

### Cartão (à vista)
1. `create-payment` com `method:"card"` só cria a **reserva**. A tela carrega o **iFrame** da SyncPay (URL montada no servidor, valor em centavos do pagamento salvo).
2. O cartão é digitado **dentro do iFrame** (não passa pelo nosso servidor). O iFrame devolve um token de uso único por `postMessage` (origem e `source` conferidos).
3. A página envia só `{paymentId, token}` a `POST /api/billing/pay-card`. O servidor **reserva a tentativa no banco** (`card_submitted_at`, atômico) e só então chama `POST /credit-card` com o IP real do comprador.
4. `200` = "submetida". O resultado vem pelo webhook; só `completed` libera o acesso.

### Webhook (`POST /api/webhooks/syncpay`)
- Evento `transaction` (`transaction.created` / `transaction.updated`). Assinatura `X-SyncPay-Signature: t=<unix>,v1=<hmac-sha256("t.corpo cru")>`, janela de 5 min. Assinatura inválida → 401 e **nada é gravado**.
- Deduplicação por `event_id` (`payment_events` único por provedor + event_id). Eventos repetidos ou fora de ordem são tratados no banco.
- Acha o pagamento por `reference_id`; se ainda não houver, pela referência `PRIMEGES:<uuid>` na descrição da cobrança.
- Erro transitório do banco → 503 (a SyncPay tenta de novo); recusa de negócio (valor divergente) → 200 + registro em `webhook_deliveries` e auditoria.

| Status SyncPay | Status interno | Efeito |
|---|---|---|
| `pending` | pending | aguarda |
| `completed` | **paid** | libera/renova o acesso (valor bruto = valor gravado, ao centavo) |
| `failed`, `refused`, `three_ds_failed` | failed | não libera |
| `refunded`, `chargeback` | refunded | marca estornado (terminal) |
| `refunding`, `med` | *(ignorado)* | nunca concede acesso; o desfecho vem em `refunded`/`chargeback`. **Não há suspensão automática do acesso** (a SyncPay manda "suspender a entrega") |

### Consulta de contingência
A SyncPay aceita **no máximo 5 consultas por transação** (a 6ª dá 429). Por isso o caminho normal é só o webhook. "Já paguei", reverificação do admin e reconciliação usam `confirmPaymentFromProvider`: contador `status_checks` incrementado **no banco antes da chamada** (atômico), teto de **4**, e o cliente só pode consultar depois de 2 min da criação (o admin não tem essa espera).

## Segurança
- Preço sempre do banco; o navegador só manda `planId`/`method` e, no cartão, `paymentId`+`token`.
- Só proprietário/administrador pagam. Cadastro da empresa incompleto (CPF/CNPJ inválido, sem telefone/e-mail) → 422 `BILLING_PROFILE_INCOMPLETE`, com link para Configurações → Empresa.
- Cartão: `POST /credit-card` **não tem idempotência**; por isso há no máximo uma tentativa em andamento por pagamento, até 3 tentativas, e nunca se retenta após `200`/5xx/timeout. Recusas definitivas (401/403/422/429) devolvem a vaga para outro cartão.
- Dados pessoais do pagador **não** vão para `payment_events` (`minimizeEvent`). Segredos nunca são logados.
- Token de acesso (1 h) fica em memória; 401 renova uma vez.
- `client_secret` e segredo do webhook só em variáveis de ambiente do servidor.

## Banco (migration `20261121220000_syncpay_gateway.sql`)
- `subscription_payments`: `charge_method` (`pix`/`card`), `card_brand`, `card_last4`, `card_submitted_at`, `card_attempts`, `status_checks`.
- `claim_gateway_payment()` (reserva por empresa + plano + forma; um índice parcial único impede 2 cobranças abertas) — `claim_subscription_payment()` antigo continua só para o código anterior durante a troca da imagem.
- `confirm_subscription_payment()` agora aceita `evopay` (histórico) e `syncpay`.
- Painel: `platform_integrations_status` (chave `syncpay`), `platform_reconcile_candidates`, `get_platform_dashboard` (`gateway_30d`) e `platform_diagnostics`.
- Reversão: `supabase/rollback/20261121220000_syncpay_gateway.down.sql`.

Testes: `tests/sql/syncpay_gateway.sql` (43/43), `tests/unit/syncpay-webhook.test.mjs`, `tests/unit/syncpay-client.test.mjs`.

## Variáveis de ambiente (`site.env` do servidor)
| Variável | Para quê |
|---|---|
| `SYNCPAY_CLIENT_ID`, `SYNCPAY_CLIENT_SECRET` | chave de API (painel SyncPay → Developer → API; permissões Consulta, Venda, Rastreio). O secret aparece **uma vez** |
| `SYNCPAY_WEBHOOK_SECRET` | segredo do webhook; gravado por `scripts/syncpay-register-webhook.mjs` |
| `SYNCPAY_API_BASE_URL` | opcional (padrão `https://api.syncpayments.com.br`) |
| `SYNCPAY_PUBLIC_KEY` + `SYNCPAY_CARD_ENABLED=1` | liga o cartão (chave pública `pk_live_`) |

## Checklist de ativação (o que depende do dono)
1. **Conta aprovada** na SyncPay (conta não aprovada responde 422 `wait_for_approval`).
2. **Criar a chave de API** (Consulta + Venda + Rastreio) e colocar `SYNCPAY_CLIENT_ID` / `SYNCPAY_CLIENT_SECRET` no `site.env` (nunca em chat nem no repositório).
3. **Autorizar o IP de saída do servidor** em Developer → API → IPs Autorizados. Atenção: é o IP doméstico; se o provedor de internet trocar o IP, os pagamentos param até atualizar a lista (idealmente IP fixo ou monitor).
4. **Cadastrar o webhook**: `node scripts/syncpay-register-webhook.mjs --env E:\primeges-local\site.env --url https://primeges.com.br/api/webhooks/syncpay` (grava o segredo sem exibir). Reiniciar o site.
5. **Cartão (opcional)**: pedir ao suporte da SyncPay a liberação de *Cartão pela API* e do *iFrame de pagamento*; cadastrar `https://primeges.com.br` em Developer API → Chave pública; colocar `SYNCPAY_PUBLIC_KEY` e `SYNCPAY_CARD_ENABLED=1`.
6. **Teste real com valor mínimo** (não há sandbox): criar um plano de R$ 1,00 só para teste (ou ajustar temporariamente), pagar um Pix e, se o cartão estiver ligado, um cartão; conferir a liberação do acesso, o painel `/admin/payments` e pedir reembolso depois.

## Pendências e riscos conhecidos
- **Política de Privacidade** ainda cita a EvoPay. O texto tem hash registrado em migration (versão + aceite), então a troca precisa de nova versão pelo fluxo jurídico. Sugestão do item: *"Prestador de pagamentos Pix e cartão (SyncPay): geração e confirmação de cobranças. Enviamos valor, referência, os dados do pagador exigidos pelo prestador (nome, CPF/CNPJ, e-mail e telefone) e, no pagamento por cartão, o IP e o navegador usados na compra para análise antifraude; os dados do cartão são digitados em formulário do próprio prestador e não passam pelos nossos servidores. O prestador devolve o status do pagamento."*
- Contrato **não verificado com cobrança real**: a relação entre `identifier` (resposta do `cash-in`) e `reference_id` (webhook/consulta) — o código cobre os dois caminhos (id gravado ou referência na descrição), mas só o primeiro pagamento real confirma.
- Parcelamento (2x a 12x) e Apple Pay não estão ligados (cartão só à vista).
- `refunding`/`med`: sem suspensão automática do acesso (hoje só o painel mostra a situação).
- Assinatura recorrente da SyncPay (cobrança automática por Pix/Pix Automático/cartão) fica para a 2ª etapa.
- Pagamentos antigos (EvoPay) continuam no histórico; o painel os mostra como "EvoPay (anterior)".
