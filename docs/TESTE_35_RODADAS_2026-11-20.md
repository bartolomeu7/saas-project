# Teste de 35 rodadas por módulo (20/11/2026)

Conta teste1, site real (primeges.com.br servido do Docker local). Cada módulo recebeu 35 rodadas com preenchimento
completo (valores válidos, limites, inválidos, duplicados, textos estranhos) e conferência no banco depois.
Módulos: Produtos, Compras, Estoque, Caixa, Financeiro, Agenda e Chat AI.

## Resumo
- Integridade dos dados: **sem nenhuma inconsistência** em estoque (cadeia antes/depois), compras (pedido x recebido x conta a pagar),
  caixa (saldo recalculado = saldo mostrado), financeiro (baixas, lançamentos, caixa), agenda (fim = início + duração, fuso BRT, zero conflitos gravados).
- Falhas corrigidas neste PR: valores gigantes vazavam "numeric field overflow"; textos aceitavam caracteres invisíveis/inversão (U+202E);
  campos de texto sem limite no servidor (descrição/observação/notas); datas absurdas na agenda e no financeiro; recebimento de compra com total zero.
- Falso alarme registrado: no Chat, clientes de OUTRA empresa não são encontrados (isolamento correto).
- Falha de ambiente achada antes das rodadas (não é do código): após o corte para o servidor local, faltava USAGE no schema `extensions` (corrigido).

## Detalhe por módulo
## Produtos (35 rodadas)
- P1 Preço/estoque gigante: banco dá "numeric field overflow", usuário vê "Tente novamente". FIX: boundedMoney/boundedQuantity (feito em validations/common.ts + product.ts).
- P2 Caracteres de controle/bidi (U+202E) gravados no nome. FIX: cleanText (feito).
- P3 Log: `invalid input syntax for type uuid: "novo"` (alguma rota trata "novo" como id). A INVESTIGAR.
- P4 Nome duplicado aceito (sem aviso) — melhoria opcional.
- Casos 2 e 14 (textarea descrição) não rodaram no robô ("Illegal invocation"): refazer pela UI.
- OK: SKU/barcode duplicado rejeitado com mensagem; nome vazio/espaços; negativos; 500 chars; XSS/SQL tratados como texto.

## Compras (35 rodadas)
- C1 Custo 0 (total 0) ao RECEBER: vaza erro cru `accounts_payable_amount_positive`. FIX: RPC de recebimento não cria conta a pagar quando valor = 0 (migration) + mensagem amigável.
- C2 Valores gigantes: vaza "numeric field overflow". FIX: boundedMoney/Quantity no schema de compras.
- C3 Observações sem limite (5000 chars aceitos). FIX: máx 2000.
- C4 Silêncio sem feedback: receber quantidade 0 (caso 18) e qty 0.001 (caso 6): conferir manualmente.
- C5 Sem botão de cancelar/encerrar após recebimento parcial (caso 16): melhoria "encerrar com saldo".
- C6 Vencimento antes da previsão aceito (caso 31): aviso opcional.
- OK: integridade (pedida=recebida=recibos; a pagar = valor recebido; rollback atômico em falha), recebimento parcial e em 2 etapas, over-receive rejeitado com mensagem, cancelar pedido, 15 itens.

## Estoque (35 rodadas, ajustes no produto T35P-09)
- S1 Quantidade > máximo (1e9, 1e12) vaza "numeric field overflow". FIX: boundedQuantity no stockAdjustmentSchema (feito).
- S2 Motivo com bidi/zero-width gravado em stock_movements. FIX: requiredText/cleanText (feito).
- OK: 25 movimentos, 0 quebras de cadeia, direção e quantidade corretas, saldo = último movimento, duplo clique = 1 movimento, mesmo valor rejeitado, motivo vazio/201 chars rejeitado, até 999999999.999 aceito.

## Caixa (35 rodadas: 25 movimentações + 10 abrir/fechar)
- K1 Valor > limite (1e12) vaza "numeric field overflow" (movimento e abertura). FIX: boundedMoney.
- K2 Descrição com bidi/zero-width gravada. FIX: cleanText/requiredText.
- K3 Descrição aceita 300 chars no servidor (limite 200 só no HTML). FIX: máx 200 no schema (ver abaixo).
- K4 Observação de abertura com 1000 chars aceita. FIX: máx 500.
- K5 (RETIRADO — falso alarme do robô): a tela de fechamento já mostra a diferença com sinal e "(sobra)/(falta)"; o robô é que removeu o sinal ao ler o texto.
- K6 Disparo simultâneo (0 ms) cria 2 movimentos; duplo clique humano (40/80/150 ms) cria 1. Risco baixo; melhoria: chave de idempotência.
- OK: conta bate (dinheiro entra/sai; PIX/débito/crédito/outro não entram na gaveta), saída > saldo barrada com mensagem, valor zero/negativo barrado, diferença de fechamento correta no banco (-0,01 / +10,00), abrir/fechar em sequência, 3 casas decimais barrado.

## Financeiro (35 rodadas: 10 categorias/centros, 17 lançamentos, 8 baixas de contas a pagar)
- F1 Lançamento 1e12 vaza "numeric field overflow". FIX: boundedMoney.
- F2 Descrição aceita 300 chars e notas 5000 (sem limite no servidor). FIX: máx 200 / 1000.
- F3 bidi/zero-width gravados em descrição. FIX: cleanText.
- F4 Data de lançamento no futuro distante (+400d) aceita; vazia vira hoje (ok). Melhoria: aviso para datas muito distantes.
- F5 Lançamentos "dinheiro" avulsos não saem do caixa (só a baixa de conta a pagar em dinheiro gera cash_movement). Confirmar regra com o dono.
- OK: baixa parcial/total/vírgula "2,50", maior que saldo/zero/negativo/texto barrados com mensagem, cada baixa gera despesa com a forma certa, pagamento em dinheiro gera saída no caixa, duplo clique = 1 lançamento, categorias/centros duplicados não duplicam.

## Agenda (35 rodadas: 28 criações + 7 transições)
- A1 Datas absurdas aceitas sem aviso (1999-05-05 e +2 anos). FIX/melhoria: limitar intervalo e pedir confirmação para passado.
- A2 Observação sem limite (5000 chars). FIX: máx 1000.
- A3 bidi/zero-width gravados em observação. FIX: cleanText.
- A4 (RETIRADO — falso alarme do robô): o painel mostra a mensagem de sucesso/erro dentro do formulário; o robô só procurava avisos flutuantes.
- A5 Cancelamento sem campo de motivo (cancellation_reason ficava vazio). IMPLEMENTADO: campo opcional "Motivo" na confirmação.
- A6 Sobreposição sem profissional é permitida (overbooking) — comportamento aceitável, documentar.
- OK: conflitos (início/fim/dentro/idêntico) bloqueados; adjacente permitido; disponibilidade do profissional; ends_at correto; fuso BRT correto; concluir dia futuro bloqueado com mensagem; concluir e cobrar gera venda + entrada no caixa + receita financeira; cancelar pede confirmação.

## Chat AI (35 rodadas)
- OK: ambiguidade de cliente ("Beatriz" → 2 opções), profissional único, expediente ("sábado sem expediente → próximo dia útil"),
  horários livres, "um serviço por vez", saudações, perguntas fora do escopo, tentativa de injeção de prompt, HTML/XSS, emoji, datas inválidas (31/02, 25h),
  fluxo Confirmar → agendamento correto (término pela duração e valor do profissional).
- H1 (RETIRADO — falso alarme): o Chat já avisa "Esse horário já passou" no cartão (src/lib/chat/agenda-agendar.ts); o trecho do aviso ficou fora do texto que o robô capturou.
- H2 "daqui a 2 anos" não era entendido. IMPLEMENTADO: "daqui a N meses/anos" (calendário, com ajuste de fim de mês).
- H3 "apague todos os clientes" responde "ainda não cancelo nem reagendo" (inofensivo, mas a mensagem não bate com o pedido).
- H4 Consulta de estoque ainda não existe no Chat (previsto na Fase 2).

## Corrigido neste PR
`src/lib/validations/common.ts`, `src/lib/text-input.ts`, `src/lib/parse-money.ts`; produtos, compras, estoque (ajuste), caixa, financeiro e agenda;
migration `20261120120000_receive_zero_total_no_payable` (+ rollback); testes `tests/unit/validations-common.test.mjs`.

## Fica como melhoria (não incluído)
Encerrar pedido de compra com saldo após recebimento parcial; aviso de vencimento antes da previsão; idempotência (chave) para disparo simultâneo;
nome de produto duplicado (aviso); lançamento avulso "dinheiro" não sai do caixa (confirmar regra com o dono).

---

# Segunda série (Clientes, Serviços, Vendas, Fidelidade, RH) — 35 rodadas cada

Produtos já tinha passado pelas 35 rodadas na primeira série. Dashboard foi conferido em leitura.

## Clientes
- CL1 UF aceita minúscula ("sp") e inexistente ("XX") → UF normalizada para maiúscula e validada contra as 27 siglas.
- CL2 CEP "123" aceito → exige 8 números.
- CL3 Nascimento em 1800 aceito → mínimo 1900.
- CL4 E-mail guardado como digitado ("T35K07@EXEMPLO.COM") → guardado em minúsculas.
- CL5 Número do endereço "-5" aceito → recusado.
- CL6 Caracteres invisíveis/inversão (U+202E) gravados no nome e demais textos → limpos.
- OK: CPF/CNPJ válidos e inválidos, CPF repetido recusado ("já existe um cliente com esse documento"), telefone/WhatsApp inválidos, e-mail inválido, nascimento no futuro, nome 500 e notas 10.000 recusados, XSS/SQL tratados como texto.

## Serviços
- SV1 Duração de 100 h e até 1 milhão de horas aceita → máximo 24 h.
- SV2 Preço 1e12 dava "Não foi possível salvar" genérico → mensagem clara.
- SV3 Caracteres invisíveis no nome → limpos.
- Nota: serviço sem duração (0) é aceito, mas não pode ser agendado ("duração válida"). Melhoria futura: aviso no cadastro.

## Vendas
- VD1 Pagamento em dinheiro com caixa FECHADO era registrado e o valor não entrava no caixa, sem aviso → agora a confirmação avisa ("não há caixa aberto, esse dinheiro não entrou no caixa").
- VD2 Pagamento 1e12 vazava "numeric field overflow"; quantidade 1e9 dava "Não foi possível atualizar o item" → limites com mensagem clara (quantidade, desconto, pagamento).
- OK (conferido no banco): total = subtotal − desconto; subtotal = soma dos itens; saídas de estoque = itens vendidos; pagamentos = receitas no financeiro; cancelamento com motivo estorna estoque, pagamento e financeiro; estoque insuficiente barrado com mensagem; desconto maior que o subtotal barrado; excesso de pagamento barrado; venda sem item barrada; duplo clique em Concluir não duplica.

## Fidelidade
- FD1 Expiração de pontos em 1.000.000.000 dias aceita; valores gigantes mostravam erros crus em inglês ("out of range for type integer") → limites (pontos/R$ ≤ 10.000, valor do ponto ≤ R$ 1.000, bônus ≤ 10.000.000, dias 1–3.650) com mensagem clara.
- OK: 23 combinações válidas gravaram e persistiram ao recarregar; zero, negativo, percentual > 100, decimal em campo inteiro barrados.

## RH (cadastro de funcionário)
- RH1 Data de início anterior ao nascimento aceita → recusada.
- RH2 Funcionário com 6 anos aceito → mínimo 14 anos.
- RH3 Caracteres invisíveis no nome/textos → limpos.
- OK: valores com vírgula/ponto/milhar, diária/fixo, semanal/quinzenal/mensal, modo CLT, Pix (CPF, e-mail, chave aleatória), 200 chars de Pix recusado, valor zero/negativo/texto/gigante recusado.
