# Teste completo de todos os módulos — 11/11/2026

Ambiente: Production (primeges.com.br), empresa **teste1**, só dados fictícios, formulários preenchidos por completo.
Método: testes na tela real + leitura do código/banco para confirmar a causa. Nada foi apagado.

**Cobertura honesta:** a meta era 20 testes por módulo. Foram feitos, por módulo, os números abaixo (cada "teste" é uma verificação com resultado). RH e Agenda já tinham 2 rodadas anteriores (`TESTES_REAIS_RH_AGENDA_*`), por isso não entraram de novo.

| Módulo | Testes | Achados |
|--------|-------:|---------|
| Clientes | 16 | C1–C6 |
| Produtos | 14 | P1–P3 |
| Serviços | 8 | S1–S2 |
| Vendas | 14 | V1–V3 |
| Caixa | 8 | CX1–CX3 |
| Estoque | 3 | E1 |
| Fornecedores | 4 | FO1 |
| Compras | 6 | CO1 |
| Financeiro | 9 | F1–F2 |
| Fidelidade | 7 | **FD1 (grave)**, FD2, FD3 |
| Equipe | 9 | EQ1, EQ2, **AG1 (grave)** |
| Relatórios | 5 | R1 |
| Dashboard | 3 | D1, D2 |
| Configurações/Assinatura | 5 | CF1, A1 |

Os módulos acima de 14 testes ficaram abaixo de 20 (e Estoque, Compras, Relatórios, Dashboard, Configurações e Assinatura ficaram bem abaixo): faltam ainda rodadas neles.

## Achados graves (corrigidos neste PR)
- **FD1 — Fidelidade: o bônus de "primeira compra" era concedido duas vezes.** Ao cancelar uma venda, só os pontos da compra eram revertidos; o bônus de +50 ficava com o cliente e era concedido de novo na venda seguinte (Ana ficou com 100 pontos de bônus). Dinheiro indireto: pontos viram desconto. Corrigido em migration (`20261111120000_reverse_loyalty_bonus_on_sale_cancel`), provada no TEST: antes 7 de 8 verificações falhavam, depois 8 de 8 passam. **Ainda não aplicada em Production.**
- **AG1 — Agenda/Equipe: dia desmarcado na disponibilidade continuava livre para agendar.** O dono desmarca sábado e domingo; o sistema aceitava agendamento nesses dias (o banco só confere o horário quando existe regra para o dia). Corrigido no código: se o profissional tem expediente, dia sem expediente é recusado.
- **C1/FO1 — CPF e CNPJ não eram validados.** `111.111.111-11` e `12.345.678/0001-00` foram aceitos. Agora o dígito verificador é conferido quando o valor tem 11 ou 14 dígitos (RG/passaporte continuam livres).
- **C2 — o mesmo CPF podia ser cadastrado várias vezes em Clientes** (fornecedores já recusavam). Agora recusa o repetido, com e sem pontuação.

## Corrigidos neste PR (menores)
- **C3** nome de cliente com 1 letra: agora exige 2.
- **C4** telefone com letras ("abcdefgh") em Clientes: agora 8 a 15 números (mesma regra do RH), também no fornecedor.
- **C6** o botão "Excluir" de cliente só inativa: virou "Inativar".
- **CX1** saída de caixa em dinheiro maior que o saldo (R$ 5.000 com R$ 130 na gaveta) era aceita e deixava o saldo esperado em −R$ 4.870. Agora recusa.
- **CX3** fechar o caixa não pedia confirmação (e não pode ser reaberto). Agora abre um diálogo com esperado, contado e diferença.
- **F2** valor "1.234,56" em Financeiro falhava com a mensagem enganosa "Informe um valor maior que zero". Agora aceita o formato brasileiro (Caixa também).
- **FD3** cliente com menos pontos que o mínimo de resgate via um campo impossível (mín. 100, máx. 50). Agora mostra "faltam N pontos".
- **EQ1** limite de usuários do plano atingido, mas o formulário de adicionar continuava ativo. Agora mostra o aviso no lugar.

## Fica para decisão / próximas rodadas (não alterado)
- **C5** "Preferências" do cliente são salvas, mas não aparecem na ficha.
- **P1** produto com custo maior que o preço é aceito sem aviso (margem −150%). Sugestão: aviso âmbar no formulário, como na Agenda.
- **P2** a ficha do produto mostra margem mas não o preço de custo (a do serviço mostra os dois); filtro por faixa de preço existe em Serviços e não em Produtos.
- **P3** o recebimento de uma compra troca o custo do produto pelo último preço pago, sem aviso nem custo médio.
- **S1** serviço com duração 0 é aceito, mas a Agenda recusa agendar ("O serviço precisa ter duração válida"). Sugestão: avisar no cadastro.
- **S2** em Equipe, o serviço sem duração aparece como "0 min".
- **V1** mensagem de erro de pagamento ("excede o saldo restante") continua na tela depois de outras ações.
- **V2** "Concluir venda" age direto, sem confirmação, embora a venda deixe de ser editável.
- **V3** venda totalmente paga continua mostrando o formulário "Registrar pagamento".
- **CX2** pagamento em dinheiro registrado com o caixa fechado não entra em nenhum caixa, e a tela da venda não avisa.
- **CX4** movimentações avulsas do Caixa (sangria, suprimento) não aparecem em Financeiro.
- **E1** Estoque é só um painel: sem histórico de movimentações, sem valor em estoque, sem filtro.
- **CO1** a página do fornecedor é o próprio formulário de edição, sem histórico de compras e contas a pagar dele.
- **F1** o Financeiro trata o estorno como "Despesa" na lista (a DRE já não os conta como despesa, o que está certo).
- **FD2** os pontos são arredondados por item (699 em vez de 700 numa venda de R$ 350): o cliente perde até 1 ponto por item.
- **EQ2** "Usuário não encontrado" ao adicionar colaborador permite descobrir se um e-mail tem conta (enumeração). Sugestão: mensagem única, como "convite enviado se a conta existir".
- **R1** o CSV de Relatórios usa ponto decimal, vírgula como separador e valores em inglês ("service"/"product"): abre desformatado no Excel brasileiro. Sugestão: `;`, vírgula decimal e rótulos em português.
- **D1** o Dashboard diz "Nenhum alerta operacional" mesmo com R$ 280 a receber vencidos, caixa fechado e agendamentos de dias sem expediente.
- **D2** atalho "Novo orçamento — Em breve" aparece no painel.
- **CF1** "Dados da empresa" tem só nome e segmento (sem CNPJ, endereço, telefone nem logo).
- **A1** "Dias restantes 53" para 02/01/2027 visto em 11/11/2026 (são 52 dias): provável contagem inclusiva.

## O que passou bem (evidência de estabilidade)
- Criar/editar cliente, produto, serviço, fornecedor, compra e profissional com todos os campos: dados completos na ida e na volta.
- Venda com produto + serviço, desconto por item, desconto manual, pagamento em Pix e dinheiro, conclusão baixa o estoque (3→1), cancelamento devolve o estoque (→3), estorna no Financeiro e atualiza os indicadores do cliente.
- Duplicidade de SKU/código de barras (criar e editar) e de documento de fornecedor recusadas; estoque insuficiente na venda recusado com mensagem clara; pagamento acima do saldo recusado; recebimento de compra acima do saldo recusado.
- Compra: total 340,00 correto, recebimento parcial atualizou dois estoques (3→9, 97→117) e valor recebido (262,00) correto.
- Relatórios, Financeiro e Dashboard fecham entre si (faturamento, despesas, resultado, a receber/pagar) depois de cada operação de teste.
- Bloqueio de horário do profissional e horário fora do expediente recusados na Agenda.

## Dados fictícios deixados na teste1
Clientes de teste (Ana Beatriz Souza Lima, "Teste CPF Invalido", "Teste CPF Duplicado", "A", "Teste Tel Letras" inativo); categorias "Cosméticos Teste Completo" e "Tratamentos Capilares (Teste Completo)"; produto Shampoo Hidratante 300ml; serviços "Hidratação Profunda…" e "Teste Duracao"; fornecedores "Distribuidora Beleza Teste"; pedido de compra PC-20261111-AD6848 parcialmente recebido; lançamento "Aluguel da sala" R$ 1.234,56; caixa do dia aberto/fechado com saída de R$ 5.000; bloqueio de 12/11 12h–13h; agendamentos de teste em 14 e 15/11; uma venda concluída (R$ 44,90) e vendas canceladas.
