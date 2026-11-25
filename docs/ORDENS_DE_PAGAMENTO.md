# Ordens de pagamento e suporte

Cada cobrança de assinatura (qualquer gateway, inclusive as manuais) tem um **número de ordem**, exibido como `OP-000001`.

- O número é gerado pelo banco (`subscription_payments.order_number`), sequencial, único e imutável. Pode haver saltos (reservas que
  não viraram cobrança também consomem número). Uma cobrança Pix pendente reaproveitada mantém o mesmo número.
- **Cliente:** vê a ordem no topo da tela do pagamento e em **Assinatura → Histórico** (“Ver ordem”). Na mesma tela abre um chamado
  (assunto + mensagem) e lê a resposta.
- **Equipe:** **/admin/support** lista os chamados abertos (mais antigos primeiro); o início do painel mostra a contagem. A resposta é
  dada no detalhe do pagamento e encerra o chamado. A busca de **/admin/payments** aceita o código da ordem.
- Responder um chamado **não** altera pagamento nem acesso: para isso use “Reverificar no gateway” ou os ajustes da empresa.
- Limites (no banco, `open_payment_ticket`): só membros da empresa dona da ordem; um chamado aberto por ordem; 10 por empresa a cada
  24 horas; mensagem de 10 a 1000 caracteres. Abertura e resposta ficam na auditoria.
- **Não há aviso por e-mail ou WhatsApp**: a equipe precisa olhar o painel.

Banco: `supabase/migrations/20261125160000_payment_orders_support.sql` (volta em `supabase/rollback/`; a volta apaga os chamados).
Testes: `tests/sql/payment_orders_support.sql` (38/38) e `tests/unit/billing.test.mjs`.
