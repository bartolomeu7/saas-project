# Quinta série de testes reais (20/11/2026) — Estoque, Compras, Caixa, Fornecedores, Agenda, Chat AI, Financeiro, Relatórios, Equipe e Assinatura

Equipe e Assinatura entraram agora (nunca tinham sido testadas). Os outros oito módulos ganharam rodadas novas para chegar a 35 nesta série
(na quarta série Compras, Estoque, Caixa, Financeiro e Relatórios ficaram abaixo disso). Tudo no site real (primeges.com.br, conta `teste1`),
com conferência no banco depois de cada bloco. Nenhuma cobrança real foi criada: em Assinatura só entraram chamadas que o servidor recusa
antes de falar com o provedor (a tabela de pagamentos continuou com 0 linhas).

| Módulo | Rodadas | O que entrou |
|---|---|---|
| Equipe | 48 | 20 de ficha do profissional, 12 de serviços/duração/preço, 7 de horários da semana, 9 de bloqueios |
| Assinatura | 40 | 13 chamadas à API de cobrança, 8 de telas conferidas no banco, 5 de endereços de pagamento inválidos, 13 de acesso sem login, planos e preços |
| Estoque | 28 + 6 | ajustes no produto (decimais, motivo, limites) com a cadeia de movimentos conferida; tela nova de saldo e movimentações |
| Compras | 29 | 20 pedidos (datas, quantidades, custos, observações, itens repetidos), 9 recebimentos/cancelamentos |
| Caixa | 19 | 2 turnos completos: abrir, 15 movimentações em 5 formas, fechar com falta e com sobra |
| Financeiro | 25 | lançamentos (valor, data, forma, categoria, centro de custo, observação) + estorno, conferidos no banco |
| Relatórios | 65 comparações | 5 períodos × 13 indicadores contra o SQL, todos idênticos |
| Fornecedores | 35 | cadastro com as regras novas: 13 válidos gravados, 22 inválidos recusados |
| Agenda | 15 | serviços, cliente, profissional, expediente, horários limite |
| Chat AI | 35 conversas | rodada 12 do banco de testes (profissionais, durações, feriados, fora do escopo, correções) |

## Achados e correções (neste PR)

**Equipe (nenhuma validação no servidor)**
- Ficha do profissional: nome de 500 letras, "12345", `<img onerror>`, telefone "abc123", especialidade de 1.000 e observações de 20.000 caracteres,
  caracteres de inversão e espaços repetidos eram gravados, sempre com "Ficha profissional salva". Agora: nome com letras (até 120), telefone
  válido, limites de tamanho, cor só entre as 6 da agenda, texto limpo (`validations/team.ts`).
- Serviços do profissional: duração "abc", "-5", "0", "1,5", 99999999999 e preço 99999999999 mostravam mensagens cruas do banco
  (`invalid input syntax for type integer`, `violates check constraint`, `numeric field overflow`); duração de 1.441 minutos passava; preço "abc" ou "-5"
  era descartado em silêncio. Agora: minutos inteiros de 1 a 1.440, preço lido como `1.280,50`, texto inválido avisa, serviço repetido recusado.
- Horários da semana: período com início vazio vazava `invalid input syntax for type time`. Agora valida formato, fim depois do início e períodos sobrepostos.
- Bloqueio de horário: aceitava ano 1999, ano 2099, 100 dias seguidos, motivo de 201 caracteres e dois bloqueios iguais no mesmo horário. Agora: de 2 anos atrás a
  3 à frente, até 60 dias, motivo até 200, e recusa duplicado.
- E-mail de colaborador: formato e tamanho conferidos no servidor.

**Compras**
- Vencimento em 2099, previsão em 2020 e vencimento **antes** da previsão de entrega eram aceitos. Agora: de 1 ano atrás a 5 à frente, datas reais do calendário,
  vencimento não pode ser antes da previsão.

**Financeiro**
- Valor "0,005" era gravado como R$ 0,01 sem aviso (o Caixa recusa 3 casas). Agora lançamento e baixa de conta a pagar recusam fração de centavo.

**Assinatura**
- Pedir cobrança do plano **Teste grátis** devolvia erro 500 genérico; agora 400 com explicação. O plano **Vitalício** dizia "sob consulta"; agora diz que é concedido pelo suporte.

**Chat AI**
- "troca para o Felipe", "muda para o Felipe", "pode ser o Felipe", "prefiro o Felipe" ou só "Felipe" depois do resumo eram ignorados em silêncio
  (só "com o Felipe" funcionava). Agora trocam o profissional; "obs: trazer o Felipe" continua sendo observação.
- "por 20 horas" e "por 1 minuto" eram ignorados em silêncio → avisa o intervalo válido (5 minutos a 12 horas).

## Conferido e OK
- **Assinatura**: plano atual, validade (02/01/2027) e dias restantes (43) batem com o banco; os 3 planos pagos mostram o preço do banco (R$ 89, R$ 240, R$ 899)
  e o teste grátis não aparece como comprável; corpo vazio, não-JSON, `planId` número/texto/null/uuid inexistente, plano inativo, sob medida, GET e preço injetado
  são recusados; as 13 páginas protegidas redirecionam para o login e a API devolve 401 sem sessão; endereços de pagamento com `../`, `' or 1=1--` e `%00` dão 404.
- **Relatórios**: Hoje, 7 dias, 30 dias, Mês e Ano — faturamento, vendas, ticket, custo, outras receitas, despesas, resultado, a receber, a pagar, agendamentos,
  concluídos e alertas de estoque batem com o banco; agenda do mês/ano já inclui os agendamentos futuros.
- **Compras**: pedido × recebido × conta a pagar sem nenhuma divergência (soma das contas = valor recebido), recebimento acima do saldo, zero e negativo recusados,
  cancelamento de pedido, total acima de R$ 999.999.999,99 recusado.
- **Caixa**: saída exatamente igual ao saldo (R$ 105) aceita, R$ 0,01 a mais recusada; débito, crédito e outro não entram na gaveta; esperado = abertura + entradas − saídas
  em dinheiro (R$ 0,00 e R$ 1.239,55); fechar com sobra de R$ 6,00 grava a diferença; descrições com emoji, aspas, `%`, `_` e HTML ficam como texto.
- **Estoque**: 11 ajustes, cadeia antes/depois sem nenhuma quebra; motivo de 200 aceito e 201 recusado; mesmo valor, vazio, acima do máximo e 4 casas recusados.
- **Financeiro**: valor 0, negativo e acima do limite recusados; data fora de 10 anos atrás/5 à frente recusada; dinheiro sem caixa aberto recusado; `1.234,56` lido certo.
- **Fornecedores**: nome numérico/vazio/181, nome e documento repetidos (com ou sem pontuação, sem diferenciar maiúscula), CNPJ/CPF inválidos, UF, CEP, cidade,
  telefone, e-mail, endereço e observações longos — todos recusados com mensagem própria; UF vira maiúscula; invisíveis e espaços repetidos limpos; duplo clique grava uma vez.

## Observações (não alteradas)
- A empresa de teste está no plano com 0 usuários adicionais, então "Adicionar colaborador" fica indisponível na tela; a validação nova de e-mail foi coberta por teste automático.
- Trimestral (R$ 240) e anual (R$ 899) não mostram a economia em relação ao mensal (a tela pública usa os mesmos cartões): melhoria de produto, não defeito.
- O formulário de horários só permite um período por dia (sem intervalo de almoço); almoço se resolve com Bloqueio.
- Produto em unidade inteira ainda aceita quantidade fracionada (observação da série anterior).

## Dados de teste
Fornecedores T5/T6, lançamentos T5 e bloqueios de teste foram apagados. Ficaram como histórico: 12 pedidos de compra de teste (4 recebidos/cancelados, 8 em aberto),
2 turnos de caixa fechados, ajustes de estoque do "Produto Teste Dono 20" (agora 50) e a ficha do profissional restaurada ao original.

## Ainda não verificado ao vivo
As correções acima foram verificadas por testes automáticos (11 novos; 1.081 no total, 0 falhas), checagem de tipos e lint; o comportamento antigo foi reproduzido
ao vivo. **O reteste no site depende de o PR ser mesclado e da imagem refeita (sem migration neste PR).**
