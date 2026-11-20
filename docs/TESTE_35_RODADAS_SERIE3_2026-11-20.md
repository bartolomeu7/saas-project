# Terceira série de testes reais (20/11/2026) — Dashboard, Clientes, Produtos, Serviços, Vendas, Fidelidade, RH

A primeira série cobriu os cadastros (criação). Esta terceira foi para o que ainda não tinha sido exercitado:
**edição, busca, categorias, pontos de fidelidade ao vivo, campanhas/multiplicadores/níveis, presença, vales, fechamento e pagamento de RH**.
Tudo no site real (primeges.com.br, conta `teste1`), com conferência no banco depois de cada bloco.

| Módulo | Rodadas | O que entrou |
|---|---|---|
| Clientes | 35 de edição + 25 termos de busca | 18 campos/regras de edição (CPF próprio/alheio/inválido, UF, CEP, e-mail, telefone, nascimento, status, duplo clique) |
| Serviços | 32 de edição + 13 de categorias | nome, preço, custo, duração 0–24 h, descrição, status, duplicados |
| Produtos | 31 de edição + 13 de categorias | SKU, código de barras, unidade, preço, estoque mínimo, tentativa de mudar estoque pelo formulário |
| Vendas | 38 | quantidade/desconto do item, desconto manual, pagamentos (excesso, 0, negativo, parcial em 2 formas), pontos, cancelamento, venda de R$ 0 |
| Fidelidade | 36 | 18 campanhas, 7 multiplicadores, 11 níveis + 7 resgates de pontos |
| RH | 55 | 17 vales/descontos/bônus, 14 de presença, 5 de pagamento, 21 de edição de funcionário, fechamento de período |
| Dashboard | conferência | 35 concluídas, R$ 2.902,30, ticket R$ 82,92, 11 canceladas, 11 clientes — idêntico ao banco |

## Achados e correções (neste PR)

**Erro ao vivo (infra)**
- Chamadas do site ao Clerk falhavam de vez em quando (`fetch failed`) e derrubavam a página inteira (erro 500). Agora a consulta do usuário e a lista de sessões tentam de novo (até 3 vezes) só em falha de rede; erros com resposta (401, 429…) continuam subindo na hora.

**Fidelidade (integridade de pontos)**
- Depois de usar pontos, reduzir a quantidade de um item deixava o desconto de pontos acima do limite da empresa (ex.: R$ 5 em pontos numa venda que caiu de R$ 50 para R$ 10 = 50% com limite de 30%) e a venda fechava com total R$ 0,00 consumindo os 100 pontos. Agora alterar/remover item confere o limite percentual **antes** de gravar.
- Campanha com bônus de 1 bilhão de pontos era aceita; a venda seguinte creditou 1.000.000.380 pontos (a próxima estouraria o inteiro do banco). Teto de 10.000.000, como nos demais bônus.
- Campanha usava o fuso do servidor: começava às 21:00 do dia anterior e terminava às 20:59 do último dia. Agora dia inteiro em São Paulo (00:00–23:59:59), inclusive na tela.
- Campanha 1900–2999 aceita: agora anos 2000–2100 e no máximo 5 anos.
- Nível com 1.000.000.000.000 pontos vazava `out of range for type integer` (e 2.147.483.647 era aceito): máximo 100.000.000 com mensagem clara.

**Busca (todas as listas e o balcão de vendas)**
- "jose" não achava "José", "alvares" não achava "Álvares"; CPF e telefone só com números não achavam o valor formatado; WhatsApp não era pesquisado. Nova busca sem acento e sem depender da pontuação (clientes, produtos, serviços, fornecedores, RH, vendas e a busca do atendimento). Sem migration.

**Cadastros**
- Nome só com números ("12345") aceito em cliente e funcionário; cidade só numérica aceita → exigem letras.
- Espaços repetidos mantidos ("Maria    Silva") em todos os nomes → juntados.
- Serviço e categorias (de serviço e de produto) com nome repetido aceitos (3 "T3 Cat A") → recusados (sem diferenciar maiúscula).
- SKU "t3-base" e "T3-BASE" conviviam (o índice do banco diferencia a caixa) → SKU sempre em maiúsculas.
- Editar um cadastro que não existe mais "salvava" e redirecionava como se tivesse dado certo → agora avisa (cliente, serviço, produto, categorias).

**RH**
- Pagamento com data 01/01/1900 aceito (e lançamento de R$ 10 mi no Financeiro em 1900) → data não pode ser antes do início do período nem antes do ano 2000.
- Presença em 1901 e 2020, início de contrato em 1900 e em 2099 aceitos → piso no ano 2000 (início até 1 ano à frente). Período de fechamento limitado a 1 ano.
- Valor de R$ 0,001 passava de "maior que zero" e o banco recusava com erro técnico (`hr_adjustments_amount_positive`) → "O valor mínimo é R$ 0,01" (vale/bônus, valor e salário do funcionário).

**Vendas / telas**
- Cancelar venda aceitava motivo de 1 letra → mínimo de 3. O aviso do diálogo agora cita estorno de pagamento e pontos.
- Campos de quantidade/desconto do item e desconto manual sem rótulo (leitor de tela) e Enter não salvava → rótulo e Enter.
- Percentuais com ponto decimal ("55.6%", "-300.0%") e KB/MB → vírgula brasileira.

## Conferido e OK
- Edição de cliente: CPF próprio permitido, de outro cliente recusado, CNPJ, e-mail em minúsculas, CEP com/sem hífen, UF minúscula normalizada, nascimento futuro/1850 recusados, S/N e 12A aceitos, XSS tratado como texto, notas 2.000, duplo clique gera 1 gravação.
- Produto: estoque pelo formulário de edição é ignorado (continua 100); SKU/código duplicado recusado.
- Vendas: estoque insuficiente barrado com mensagem; desconto maior que subtotal, negativo e 1e12 barrados; pagamento acima do saldo, 0, negativo e 0,001 barrados; 2 pagamentos (Pix + débito) fecham a venda; cancelamento estorna estoque, pagamentos e pontos (ganho e resgate); com pontos usados o cliente da venda fica travado.
- Pontos: mínimo 100, 0, negativo, texto, decimal e acima do saldo recusados com mensagens claras; 100 pontos = R$ 5,00; ganho em cima do total depois do desconto (45 → 90 pontos); bônus de primeira compra uma vez só.
- RH: 17 casos de vale/bônus/desconto (valor 0, negativo, texto, 10 mi, data futura, descrição 301, caracteres invisíveis limpos); dias já pagos não podem ser alterados; dia futuro e intervalo > 62 dias recusados; dinheiro sem caixa aberto recusado com mensagem clara; pagamento já efetuado não pode ser cancelado (por desenho).

## Observações (não alteradas)
- Venda de R$ 0,00 (item com 100% de desconto) conclui normalmente (brinde); baixa estoque e não gera pontos.
- Serviço com custo maior que o preço e preço 0 são aceitos (a tela mostra a margem negativa).
- Campanha com multiplicador 0 (não pontua) é aceita: está no desenho do banco (0 a 100).
- Dados de teste ficaram como histórico: 1 cliente/1 serviço/1 produto "T3" inativos, 2 vendas concluídas/4 canceladas de teste, 150 pontos de fidelidade do cliente de teste. As categorias, campanhas, multiplicadores e níveis de teste foram apagados; lançamentos de RH de teste foram removidos/cancelados (conta Maria Teste restaurada).

## Ainda não verificado ao vivo
As correções acima foram verificadas por testes automáticos (+ checagem de tipos e lint) e pelo comportamento antigo reproduzido ao vivo; **o reteste no site depende de o PR ser mesclado e a imagem do site refeita**.
