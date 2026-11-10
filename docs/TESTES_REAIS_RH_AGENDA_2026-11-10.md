# Testes reais — RH e Agenda (10/11/2026)

Feitos no site em produção (primeges.com.br), logado como dono da empresa teste1, só com dados fictícios, como um usuário faria. 10 testes por módulo.

## RH

| # | Teste | Resultado |
|---|---|---|
| 1 | Cadastrar com valor inválido ("abc"), negativo e enorme | OK — mensagens claras ("Informe o valor", "Valor alto demais") |
| 2 | Nome vazio | OK, mas usa o aviso nativo do navegador (estilo diferente das outras mensagens) |
| 3 | Datas futuras e telefone "abc" | Nascimento futuro recusado. **Admissão em 2031 e telefone "abc" foram aceitos** |
| 4 | Marcar presença antes da admissão | **Aceito** (admissão 2031, presença em 02/11/2026 gravada) |
| 5 | Desconto de R$ 5.000 com bruto de R$ 1.500 | OK — mostra líquido negativo, avisa e esconde o botão de fechar. Mas o lançamento foi aceito sem aviso |
| 6 | Fechar período sobreposto | OK — "Já existe um pagamento que cobre parte deste período" |
| 7 | Cancelar pagamento pendente | Funciona e libera os dias. **Sem confirmação**; recibo cancelado continua imprimível com campo de assinatura |
| 8 | Busca, ID inexistente | OK (busca sem diferenciar maiúscula; 404 amigável). A página 404 responde HTTP 200 |
| 9 | Celular 375 px | OK, sem rolagem lateral; abas à direita ficam cortadas (rolam) |
| 10 | Inativar funcionário | **BUG: não inativa e não avisa** |

### Bugs e inconsistências (RH)
1. **Inativar falha em silêncio** quando a admissão é futura: a ação grava `ended_on` = hoje, o banco recusa (`ended_on >= started_on`) e o erro é descartado (`if (!error) {}` vazio em `setEmployeeStatusAction`). O usuário clica, a página recarrega e nada muda.
2. **Admissão futura e presença antes da admissão são aceitas** (causa do bug 1).
3. **Telefone sem validação** (aceita texto).
4. **Apagar vale/desconto e cancelar pagamento sem confirmação** (a Venda pede motivo no cancelamento; o RH não).
5. Lançamento de desconto maior que o bruto é aceito; só o fechamento avisa.
6. Formulário de vale mostra "Se for vale: como foi pago?" mesmo para desconto/bônus.
7. "R$ 1.500,00 por dia" com pagamento mensal confunde (valor por dia × período).
8. Painel: "Dias de pagamento (7 dias)" mostra só informais; a folha CLT não entra.
9. Sem mensagem de erro visível na tela quando a ação falha por regra do banco (padrão `if (!error) {}`).

## Agenda

| # | Teste | Resultado |
|---|---|---|
| 1 | Agendar no passado (09/11 22:00) | **Aceito sem aviso** |
| 2 | Conflito de profissional | OK — "Profissional já possui agendamento neste horário" |
| 3 | Sem cliente e sem profissional | Aceito (decisão de produto) |
| 4 | Concluir com Pix um agendamento de amanhã | **Aceito**: cria venda paga **datada de hoje** |
| 5 | Cancelar a venda criada pelo agendamento | Venda cancelada, **agendamento continua "Concluído"** apontando para venda cancelada; sem como reabrir |
| 6 | Reagendar para horário em conflito | OK — bloqueado com mensagem |
| 7 | Cancelar agendamento | **Sem confirmação, sem motivo, sem desfazer** |
| 8 | Busca e visão mensal | Busca ótima (cliente, serviço, observações). Sem mensagem "nada encontrado". Mês mostra cancelados na contagem |
| 9 | Impressão do dia | OK. "3 atendimentos" inclui cancelado enquanto o valor previsto exclui |
| 10 | Celular | Sem rolagem lateral, mas o formulário "Novo agendamento" fica ~2.000 px abaixo (sem botão "+ Novo") |

### Bugs e inconsistências (Agenda)
1. **Concluir agendamento futuro** gera receita antes do serviço acontecer.
2. **Venda cancelada não reflete no agendamento** (fica Concluído para sempre).
3. Agendar no passado e atravessando a meia-noite (22:00–01:30) sem aviso.
4. Agendamento antigo ainda "Agendado" não é marcado como atrasado/falta.
5. Cancelar sem confirmação/motivo.
6. Cabeçalho "Terça-Feira, 10 De Novembro" com maiúsculas indevidas (a impressão usa "Segunda-feira, 09 de novembro").
7. Contagens divergentes entre impressão, mês e painel quando há cancelados.

## Melhorias de processo sugeridas
**RH:** impedir admissão futura/presença antes da admissão; validar telefone; confirmação ao cancelar pagamento e apagar lançamento; fechar folha em lote; folha CLT no painel de vencimentos; mostrar o erro quando a ação falha.
**Agenda:** botão "+ Novo agendamento" fixo no celular; aviso ao agendar no passado/virar o dia; bloquear (ou avisar) concluir no futuro; reabrir agendamento quando a venda é cancelada; confirmação + motivo ao cancelar; marcar "não compareceu"; mensagem de "nada encontrado".

## Dados fictícios criados nesta rodada (teste1)
- RH: funcionário "Joao Duplicado Ficticio" (admissão 2031, 1 presença em 02/11, sem pagamento ativo; 1 pagamento cancelado).
- Agenda: agendamentos 09/11 22:00 (cancelado) e 11/11 09:00 (concluído, venda cancelada).

## Status das correções (PR desta rodada)
Corrigido: inativar (erro não é mais engolido; admissão futura sai na data de início), presença antes da admissão recusada, telefone validado, confirmação ao apagar lançamento / cancelar pagamento / cancelar agendamento, campo "como foi pago" só para vale, concluir atendimento de dia futuro bloqueado, contagem da impressão sem cancelados, maiúsculas do título da Agenda.
Ficam para depois (exigem decisão ou mudança no banco): reabrir agendamento quando a venda é cancelada, aviso ao agendar no passado/virar a meia-noite, "não compareceu" automático, botão "+ Novo" no celular, folha CLT no painel de vencimentos, fechar folha em lote.
