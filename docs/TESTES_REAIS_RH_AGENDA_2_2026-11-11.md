# Testes reais — RH e Agenda (rodada 2) — 11/11/2026

Ambiente: Production (primeges.com.br), empresa **teste1**, só dados fictícios. Objetivo: validar o que o PR #88 entregou e que não tinha sido provado no site.

## RH (10 testes)

| # | Teste | Resultado |
|---|-------|-----------|
| 1 | Criar CLT fictício "Paulo Clt Teste2" (admissão 03/08/2026) e ver o aviso de folha pendente no painel | OK — "Folha de 10/2026 ainda não fechada para 1 funcionário(s) CLT" com link para o lote |
| 2 | Tela de lote lista só quem está pendente no mês | OK — Paulo aparece em 10/2026; não aparece em 07/2026 (antes da admissão) |
| 3 | Fechar folha em lote com sucesso | OK, mas **2 achados** (A e B abaixo) |
| 4 | Lote em mês que não começou (12/2026) | OK — erro por funcionário, "mês que ainda não começou" |
| 5 | Parâmetro de mês inválido (`?mes=abc`) | OK — cai no mês anterior |
| 6 | Aviso some após fechar | OK |
| 7 | Mês já fechado na ficha do funcionário | OK — sem botão, "Este mês já tem um pagamento fechado" |
| 8 | Valores da folha (R$ 2.500 → INSS 200,69, IRRF 0, líquido 2.299,31) | OK, igual à folha individual |
| 9 | Folha de mês anterior à admissão (junho, admissão em agosto) | **Achado C**: calcula e deixa fechar |
| 10 | Folha do mês da admissão (agosto, admissão dia 03) | **Achado D**: salário cheio, sem proporcional |

### Achados e destino
- **A (bug, corrigido):** a folha fechada em lote ficou com vencimento 31/10 (fim do mês), enquanto a individual vence no dia de pagamento (05/11). O lote não enviava a data. Agora usa `nextPayday` do funcionário.
- **B (UX, corrigido):** depois de fechar tudo, a lista esvaziava e o formulário (que guardava a mensagem de sucesso) saía da tela: o usuário via só "Nenhuma folha pendente", sem confirmação. O formulário agora continua montado e mostra "N folha(s) fechada(s)".
- **C (bug, corrigido):** o fechamento aceitava mês anterior à admissão. Agora recusa ("Esse mês é anterior à admissão do funcionário").
- **D (melhoria, NÃO feita):** mês da admissão paga salário cheio. O correto seria proporcional aos dias trabalhados. Precisa de decisão de regra (dias corridos ou 30 avos) antes de implementar.
- **E (observação):** o aviso do painel só olha o mês anterior; folhas de meses mais antigos esquecidas não aparecem.

## Agenda (10 testes)

| # | Teste | Resultado |
|---|-------|-----------|
| 1 | Aviso de horário que já passou | OK |
| 2 | Aviso de atendimento que cruza a meia-noite | OK |
| 3 | Horário normal não gera aviso | OK |
| 4 | Criar agendamento e concluir (cobrar depois) gera venda | OK |
| 5 | Cancelar essa venda reabre o agendamento ("Agendado", sem venda) | OK — o gatilho de Production funciona |
| 6 | Concluir de novo gera nova venda (id diferente) | OK |
| 7 | Venda paga no Pix, ao cancelar, também reabre | OK |
| 8 | Botão "+ Novo agendamento" no celular (375 px) | **Achado F**: ficava no fim da página, fora da tela |
| 9 | Toque no botão leva ao formulário | OK |
| 10 | Atendimento que termina exatamente às 00:00 | **Achado G**: avisava "depois da meia-noite" |

### Achados e destino
- **F (bug, corrigido):** a animação de entrada `.prime-module-page` usava `fill-mode: both`, o que deixa um `transform` ativo para sempre e transforma a página no bloco de contenção de todo `position: fixed` dentro dela. O botão ficou em y=3399 num viewport de 812. Trocado para `backwards`. Provado no site removendo a animação: o botão foi para y=756–796. Pode haver outros elementos fixos em páginas do mesmo wrapper com o mesmo sintoma.
- **G (menor, corrigido):** término exatamente à meia-noite não avisa mais.
- **H (UX, sugestão):** o diálogo "Cancelar venda" não diz que o agendamento vinculado vai voltar para "Agendado". Vale uma linha de texto.
- **I (observação):** venda já paga integralmente ainda mostra o formulário "Registrar pagamento".

## Dados fictícios deixados na teste1
- Funcionário "Paulo Clt Teste2" com a folha 10/2026 fechada e a pagar (R$ 2.299,31).
- Agendamento de hoje 20:00 (Cliente Teste Dono 20), "Agendado"; duas vendas de R$ 280 canceladas.
