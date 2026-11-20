# Quarta série de testes reais (20/11/2026) — Estoque, Compras, Caixa, Fornecedores, Agenda, Chat AI, Financeiro, Relatórios

A primeira série (`TESTE_35_RODADAS_2026-11-20.md`) cobriu a **criação** em Compras, Estoque, Caixa, Financeiro, Agenda e Chat.
Fornecedores e Relatórios ainda não tinham sido testados. Esta série foi para o que faltava: Fornecedores inteiro, **estorno** de compra,
histórico de Estoque e Caixa, reagendar/concluir/cancelar na Agenda, números dos Relatórios contra o banco e novas frases no Chat.
Tudo no site real (primeges.com.br, conta `teste1`), com conferência no banco depois de cada bloco.

| Módulo | Rodadas ao vivo | Como |
|---|---|---|
| Fornecedores | 35 de cadastro + 35 de edição | formulário real, 18 campos/regras |
| Agenda | 23 criações + 8 reagendamentos + 12 concluir/cancelar | formulário real da agenda (dia/semana) |
| Chat AI | 36 conversas (rodada 11 do banco de testes) | motor do Chat com a agenda real da empresa de teste |
| Caixa | 13 (abrir, 7 movimentações, fechar) | formulários reais, saldo conferido no banco |
| Compras | 6 cenários de estorno/recebimento (+ auditoria do código) | pedido → recebimento → pagamento parcial → estorno |
| Relatórios | 5 períodos × 4 indicadores contra o SQL + CSV | números idênticos ao banco em todos |
| Estoque, Financeiro | ajuste com estoque menor que a entrada, leitura das telas e do banco | auditoria de código + cenários |

> Nem todo módulo chegou a 35 rodadas ao vivo nesta série: Fornecedores e Agenda passaram de 35; Compras, Estoque, Financeiro e Relatórios
> foram cobertos por cenários dirigidos e auditoria do código (a primeira série já tinha feito 35 de criação em cada um).

## Achados e correções (neste PR)

**Compras / Financeiro (integridade de dinheiro) — o mais sério**
- Estornar um recebimento cuja conta a pagar estava **parcialmente paga** devolvia o estoque (15 → 5) e cancelava o recibo, mas a conta
  continuava "parcial 40/10": R$ 30 de dívida sem mercadoria. Receber o pedido de novo criava **outra** conta (R$ 80 devidos por R$ 40 de mercadoria).
  Agora o banco recusa com mensagem clara. Migration `20261120200000_cancel_receipt_block_partial_payable` (+ rollback).
- Estornar um recebimento quando o estoque atual já é menor que a entrada derrubava a tela inteira ("Não foi possível carregar as Compras").
  Agora aparece o motivo em aviso e o pedido continua na tela. Vale também para cancelar pedido.
- O formulário de novo pedido listava fornecedor **inativo**, embora a tela do fornecedor diga que ele "deixa de aparecer" e o banco recuse
  na hora de salvar. Agora só os ativos aparecem.
- Lançamento manual digitado errado não tinha como ser corrigido. Novo **Estornar** em Receitas e despesas (só lançamentos avulsos; se foi
  em dinheiro, devolve o valor ao caixa aberto). Migration `20261120210000_cancel_manual_financial_entry` (+ rollback), só owner/admin, com auditoria.

**Fornecedores (nenhuma validação no servidor)**
- Nome só com números ("12345"), nome acima de 180 caracteres (erro genérico), nomes repetidos (3 "T4 Distribuidora Alfa"), CNPJ repetido sem
  pontuação (a trava do banco compara o texto), e-mail de 296 caracteres e "a@b", UF "XX"/"ZZ", CEP "123"/"abcde-fgh", cidade "999",
  endereço de 1.000 caracteres, observações de 5.000, número "-5", caracteres invisíveis/inversão no nome, espaços repetidos — tudo era gravado.
  Agora usa as mesmas regras do cadastro de clientes (`validations/supplier.ts`), com mensagens específicas (CPF/CNPJ/telefone).
- Editar um fornecedor inexistente "salvava" e redirecionava como sucesso → agora avisa.

**Relatórios**
- Exportação CSV: nome de produto/serviço começando com `=`, `+`, `-` ou `@` virava **fórmula** no Excel (CSV injection) → neutralizado.
- CSV usava vírgula e ponto decimal (`2902.30`): no Excel em português tudo caía numa coluna só e os números viravam texto. Agora `;`,
  vírgula decimal e quebra de linha do Windows, com faturamento por dia, formas de pagamento e **todos** os itens (antes só os 8 do gráfico).
- "Agendamentos" de Este mês / Este ano ignoravam o que ainda vai acontecer (3 futuros hoje); agora contam até o fim do mês/ano.
- Consultas com `.in(sale_id…)` agora em blocos de 150: uma empresa com milhares de vendas no período estouraria o tamanho da consulta.

**Estoque**
- Nenhuma tela mostrava as movimentações (`stock_movements`) nem os produtos com saldo normal. Novo **Saldo por produto** (busca por nome/SKU/código
  e filtro de nível, 50 por vez) e **Últimas movimentações** (origem em português, variação com sinal, saldo antes → depois, motivo).

**Caixa**
- Só o último fechamento era mostrado. Novo **Fechamentos anteriores** (10 últimos, diferença com "(sobra)"/"(falta)"); o cartão do último
  fechamento também ganhou o rótulo.

**Financeiro**
- A coluna de categoria mostrava só "Categorizado" → agora o nome da categoria.
- Contas a pagar/receber cortadas em 100 itens sem aviso → aviso de que o total do topo considera todas.

**Agenda**
- Concluir com valor de 11 dígitos vazava `numeric field overflow` → "Valor muito alto". Valor do preço e do pagamento agora entende `1.280,50`
  (o interpretador antigo transformava em número inválido e ignorava). Reagendar sem data dizia "Agendamento ou horário inválido" → "Informe o novo dia e horário."

**Chat AI**
- "valor -50" e "valor 99999999999" eram ignorados em silêncio (o cartão continuava R$ 55,00 sem explicar) → agora avisa o intervalo válido.

**Compras (tela)**: busca por número do pedido/fornecedor e filtro de situação (antes a lista tinha todos os pedidos de uma vez).

## Conferido e OK
- **Agenda**: conflito igual/parcial/encostado, antes/depois do expediente, termina depois do expediente, domingo e sábado, ano 2030 e 2023 recusados, 29/02/2028,
  2029 aceito, observação 1000 aceita e 1001 recusada, serviço de 0 min recusado, reagendar (válido, sábado, 2030, 2020, sobre outro, fora do expediente),
  cancelar com motivo (201 letras recusado, válido gravado), valor maior que o saldo recusado, concluir sem forma deixa a venda "a receber".
- **Caixa**: saldo negativo, 1e12 e 3 casas recusados; saída maior que o dinheiro disponível barrada; Pix não entra na gaveta; saldo esperado = 50 + 20 − 30 = 40;
  fechamento com 38 informado → diferença −2,00 no banco.
- **Relatórios**: Hoje/7 dias/30 dias/Mês/Ano batem com o SQL em faturamento, vendas, custo e ticket (R$ 3.202,30, 41 vendas, R$ 825,23 no mês).
- **Chat**: 24h, 25h, 9:60, 10h75, 31/04, 30/02, injeção (`DROP TABLE`, `<script>`), emoji, caractere invisível, frase vazia, 2.400 caracteres,
  "sim"/"confirmar" por texto (só grava pelo botão), domingo e feriado (próximo dia útil).

## Observações (não alteradas)
- Produto em unidade inteira (un, cx, pct, kit) aceita quantidade fracionada (2,5 un) no ajuste, na compra e na venda, e o estoque real já tem
  casas decimais (114,5 un). Exigir inteiro exige decidir o que fazer com o que já existe.
- Pagamento de venda em dinheiro com o caixa **fechado** é aceito e não gera movimento de caixa (desenho do gatilho); vale um aviso na tela de pagamento.
- "No natal" e "no fim de semana" no Chat não são entendidos (pede a data); "não" no cartão de confirmação só repete o cartão.
- Concluir um atendimento antigo gera a venda com a data de hoje (a receita entra no dia da conclusão).

## Dados de teste
Fornecedores T4 e agendamentos T4 sem histórico foram apagados. Ficaram como histórico: o fornecedor "12345" com o pedido PC-20261120-D99D89
(recebido, estornado e recebido de novo, com duas contas a pagar nascidas do defeito acima), 6 atendimentos T4 concluídos com venda,
1 atendimento 2024 cancelado e 1 fechamento de caixa de teste.

## Ainda não verificado ao vivo
As correções acima foram verificadas por testes automáticos (13 novos; 1.070 no total, 0 falhas), checagem de tipos e lint; o comportamento
antigo foi reproduzido ao vivo. **O reteste no site depende de o PR ser mesclado, das duas migrations aplicadas no banco local e da imagem refeita.**
