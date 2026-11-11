# 02 — Subagentes e fichas (requisitos reais dos módulos)

Fonte: formulários, validações e funções do banco **como estão em Production em 11/11/2026** (conferidos no código e nas migrations). O que não consegui confirmar está marcado **[verificar]**.

## 2.0 Convenções
- **Nível:** `OBR` obrigatório (pergunta) · `REC` recomendado (oferece uma vez, pode pular) · `PAD` padrão (preenche sozinha, mostra no cartão).
- **Tipos:** `entidade` (resolve cadastro), `dinheiro`, `qtd`, `data`, `hora`, `texto`, `enum`.
- **Limites do banco (valem para qualquer valor digitado):** dinheiro `numeric(12,2)` (máximo R$ 9.999.999.999,99); quantidade de estoque `numeric(12,3)`. A Cláudia recusa acima disso com mensagem clara (nos testes, R$ 99.999.999.999 caiu em "Não foi possível salvar").
- **Executor:** sempre uma função **já existente** ou uma "função núcleo" extraída da ação da tela (como `closePayrollCore` no RH), para a tela e o chat compartilharem exatamente as mesmas conferências. Onde falta função tudo-ou-nada, está marcada **DEPENDÊNCIA** (seção 2.11).
- **Perfis:** `dono`, `gerente` (admin), `funcionário`. Permissão do chat = permissão da tela (`can()`).
- **Diálogos de exemplo** viram testes automáticos (arquivo 04).

Mapa de subagentes e fase de entrega:
| Subagente | Menu | Intenções | Fase |
|-----------|------|-----------|------|
| `agenda` | Agenda | agendar, reagendar, confirmar, não compareceu, concluir, bloquear horário, consultar dia, horários livres | 2 (agendar), 3 (demais) |
| `produtos` | Produtos/Estoque | cadastrar produto, baixa, entrada, definir saldo, alterar preço, consultar saldo/alertas | 3 |
| `servicos` | Serviços | cadastrar serviço, alterar preço/duração | 3 |
| `clientes` | Clientes | cadastrar, alterar contato, consultar | 3 |
| `financeiro` | Financeiro | lançar despesa/receita, pagar conta, consultar | 4 |
| `caixa` | Caixa | abrir, movimento, consultar | 4 |
| `vendas` | Vendas | registrar venda, consultar | 5 |
| `compras` | Compras/Fornecedores | cadastrar fornecedor, criar pedido, receber, consultar | 6 |
| `rh` | RH | vale/desconto/bônus, presença, consultar | 7 |
Não entram pelo chat (decisão de segurança): Equipe, Configurações, Assinatura, Fidelidade (só o saldo aparece em consulta de cliente), Relatórios (as consultas simples saem de Vendas/Financeiro).

---

## 2.1 Subagente `agenda`
Permissão: qualquer membro, **exceto bloquear horário** (gerente/dono, como a tela da Equipe). Tabelas/funções: `create_appointment`, `reschedule_appointment`, `set_appointment_status`, `complete_appointment`, `create_professional_block`.

### 2.1.1 `agenda.agendar` (R1)
Funções: `create_appointment(p_customer_id, p_service_id, p_professional_id, p_starts_at, p_duration_minutes, p_price, p_notes)`.
| Campo | Nível | Tipo | Regra / origem | Pergunta (texto) | Padrão |
|-------|-------|------|----------------|------------------|--------|
| serviço | OBR | entidade `servico` | ativo; precisa de duração > 0 | "Qual serviço?" (botões dos mais usados) | — |
| cliente | OBR (regra do dono; o banco aceita vazio) | entidade `cliente` | ativo | "Para qual cliente?" | — |
| profissional | OBR (banco aceita vazio) | entidade `profissional` | **habilitado para o serviço**; ativo; só aparecem na pergunta os habilitados | "Quem vai fazer? (Rafael, Lúcio)" | se só houver 1 habilitado, sugere e mostra no cartão |
| início | OBR | data+hora | futuro (aviso se passado); dentro do expediente do profissional | "Que dia e horário começa?" (botões: horários livres) | — |
| término | PAD | hora | **início + duração do serviço**; se o usuário disser "das 14 às 16", vira duração = diferença | (não pergunta) | calculado |
| valor | PAD | dinheiro | ≥ 0 | (só se o usuário citar) | preço do serviço |
| observações | REC | texto ≤ 500 [verificar limite] | — | "Alguma observação? (pode pular)" | vazio |
| veículo/placa | REC (só segmentos automotivos, se D3) | entidade `veiculo` | — | "Qual veículo? (placa)" | — |

Conferências (todas as do banco **mais** as do app, na ordem em que a Cláudia mostra problemas):
1. Profissional habilitado ("Este profissional não está habilitado para o serviço selecionado.").
2. **Dia sem expediente:** se o profissional tem expediente cadastrado e não atende nesse dia da semana → recusa (regra criada no PR #90).
3. Dentro do horário de trabalho do dia.
4. Sem bloqueio ("O profissional possui um bloqueio neste horário.").
5. Sem conflito ("Profissional já possui agendamento neste horário.").
6. Duração do serviço válida ("O serviço precisa ter duração válida.").
7. Avisos (não bloqueiam): horário já passou; termina depois da meia-noite; data a mais de 12 meses; cliente inativo.
Sugestão de horários livres: calculada pelo app a partir de expediente, bloqueios e agendamentos do dia; **é só sugestão**: a confirmação sempre revalida no banco.

Cartão de confirmação: módulo "Agenda › Novo agendamento"; Cliente (link para a ficha); Serviço; Profissional (link); **Data por extenso + início–término + duração**; Valor; Observações; avisos. Botões: Confirmar · Corrigir · Cancelar.
Executor: núcleo `createAppointmentCore` (extrair de `createAppointmentAction`, que já faz a conferência de dia sem expediente) → `create_appointment`. Resultado: "Agendado!" + link para a Agenda no dia (parâmetro de data da URL **[verificar]**) + "Agendar outro".
Diálogos de teste:
- *Completo:* "Cláudia, agenda lavagem detalhada pro João Ferreira amanhã às 14h com o Lúcio" → confirma direto.
- *Incompleto (seu exemplo):* "agendamento de lavagem detalhada pro João Ferreira" → pergunta início e profissional (juntas), calcula o término, oferece observações, confirma.
- *Ambíguo:* dois "João" → desambiguação com telefone.
- *Conflito:* horário ocupado → mostra livres; escolher um reapresenta o cartão (versão+1).
- *Profissional não faz o serviço:* lista quem faz.
- *Correção:* "troca pro Rafael" no cartão.
Bordas: serviço sem duração (oferece abrir o cadastro do serviço); cliente novo ("não achei João Ferreira: cadastro agora?" abre o fluxo `clientes.cadastrar` e volta); fuso e virada de dia; domingo; feriado (o sistema não tem feriado: não avisa); mesma ordem repetida em 10 s (idempotência); profissional inativado entre o resumo e a confirmação.

### 2.1.2 `agenda.reagendar` (R2) — `reschedule_appointment(p_appointment_id, p_starts_at)`
Ficha: agendamento (OBR, entidade: "o do João amanhã", "o das 14h do Lúcio"; só status agendado/confirmado — "Este agendamento não pode ser reagendado."), novo início (OBR). O término **mantém a duração**. Mesmas conferências 2–5 da tela. Cartão mostra **antes → depois**. Se achar mais de um agendamento, lista.

### 2.1.3 `agenda.confirmar` e `agenda.nao_compareceu` (R2) — `set_appointment_status(p_appointment_id, p_status, p_reason)`
Ficha: agendamento (OBR), motivo (REC para não compareceu). Cartão antes → depois. **Cancelar atendimento** (`cancelled`, pede motivo) fica **R3 / fase 7**.

### 2.1.4 `agenda.concluir` (R2) — `complete_appointment(p_appointment_id, p_method, p_amount)`
Cria a venda e, se houver forma, o pagamento (tudo ou nada). Ficha: agendamento (OBR; só agendado/confirmado), forma de pagamento (REC: pix, dinheiro, débito, crédito, outro, **ou "cobrar depois"**; padrão: cobrar depois), valor recebido (PAD: total). Regras: **não conclui atendimento de dia futuro** (regra do app); informar valor sem forma gera "Informe a forma de pagamento." (a Cláudia nunca deixa chegar nisso). Aviso se escolher dinheiro com caixa fechado (ver `vendas`). Resultado: link da venda.

### 2.1.5 `agenda.bloquear` (R2, gerente) — `create_professional_block(p_professional_id, p_starts_at, p_ends_at, p_reason)`
Ficha: profissional (OBR), início (OBR), fim (OBR, > início; "das 12 às 13" ou "o dia todo" = expediente do dia), motivo (REC). Aviso se houver agendamentos dentro do bloqueio (o bloqueio não cancela agendamentos; a Cláudia lista quais são).

### 2.1.6 Consultas R0
"O que tenho amanhã?", "agenda do Lúcio hoje", "horários livres do Rafael sexta": lista cronológica (hora, cliente, serviço, status) e link para a Agenda. Respeita o escopo da tela (funcionário vê o que a tela mostra).

---

## 2.2 Subagente `produtos` (cadastro, preço e estoque)
Permissões: cadastrar — conforme a tela [verificar se funcionário cadastra produto]; **alterar preço/custo = `pricing.edit`** (gerente/dono); **ajustar estoque = `stock.adjust`** (gerente/dono); ver custo = `cost.view`.

### 2.2.1 `produto.cadastrar` (R1) — insere em `products` via núcleo de `createProductAction`
| Campo | Nível | Tipo | Regra | Pergunta | Padrão |
|-------|-------|------|-------|----------|--------|
| nome | OBR | texto | ≥ 2 letras; aviso se já existe produto **parecido** ("já tenho Limpa-baú 50L: é o mesmo?") | "Qual o nome do produto?" | — |
| categoria | REC | entidade `categoria` | ativa | "Em qual categoria?" | sem categoria |
| unidade | REC | enum un/kg/g/l/ml/m/cx/pct/kit | — | "Vende por unidade, litro, caixa…?" | un |
| preço de venda | REC | dinheiro | ≥ 0, ≤ limite do banco | "Qual o preço de venda?" | 0 |
| preço de custo | REC (só com `cost.view`) | dinheiro | ≥ 0; **aviso se custo > venda** (margem negativa) | "E o custo?" | 0 |
| estoque inicial | REC | qtd (3 casas) | ≥ 0 | "Quantas unidades tem agora?" | 0 |
| estoque mínimo | REC | qtd | ≥ 0 | "Avisar quando chegar em quanto?" | 0 |
| SKU / código de barras | opcional (uma oferta só) | texto | **únicos na empresa** ("Já existe um produto com esse SKU ou código de barras.") | "Tem SKU ou código de barras?" | vazio |
| descrição | opcional | texto | — | (não pergunta) | vazio |
Cartão: nome, categoria, unidade, preço, custo e **margem calculada** (como na tela), estoque inicial/mínimo, avisos. Regras de entendimento: "limpa-baú de 50 litros" → **nome completo**; "50" não vira quantidade (arquivo 01/§2.2).
Resultado: link para o produto.

### 2.2.2 `estoque.baixa` (R2) — saída/perda
Ficha: produto (OBR), quantidade que sai (OBR; **"acabou" = tudo**), motivo (OBR; botões: perda, avaria, vencido, consumo interno, acabou, outro + texto), observação (opcional).
Cálculo: `novo saldo = saldo atual − quantidade`. Se quantidade > saldo atual → "Só há {n} em estoque."
Cartão: **{saldo atual} → {novo saldo}**, motivo, produto (link), aviso se ficar abaixo do mínimo ("vai ficar em estoque baixo") e oferta "Quer registrar uma compra para repor?" (abre `compras.criar` pré-preenchido).
**Executor e concorrência:** a função existente `adjust_product_stock(p_product_id, p_new_quantity, p_reason)` recebe o **saldo novo absoluto**. Se alguém vender entre o resumo e a confirmação, gravar "novo saldo" apagaria essa venda. Duas saídas:
- **DEPENDÊNCIA D6 (recomendada):** nova função `adjust_product_stock_delta(p_product_id, p_delta, p_reason, p_expected_current numeric default null)` que trava a linha, confere o saldo esperado e aplica a diferença; mesma permissão, mesma auditoria.
- Até existir: o executor relê o saldo e **só grava se ainda for igual ao exibido**; senão volta ao cartão com "O estoque mudou para {x}; confirma assim mesmo?".

### 2.2.3 `estoque.entrada` (R2) — D4
Ficha: produto (OBR), quantidade (OBR), custo unitário (REC), motivo (PAD: "entrada de mercadoria"). v1: ajuste de saldo (mesma função/concorrência da baixa). Se o usuário disser "comprei do fornecedor X, vence dia 20", a Cláudia **propõe** abrir `compras.criar` (que gera a conta a pagar) e explica a diferença.

### 2.2.4 `estoque.definir_saldo` (R2) — contagem de inventário
Ficha: produto (OBR), saldo contado (OBR), motivo (PAD: "contagem de inventário"). Cartão mostra a diferença para o saldo atual (+/−).

### 2.2.5 `produto.alterar_preco` (R2, `pricing.edit`)
Ficha: produto (OBR), novo preço de venda e/ou de custo (OBR um deles). Cartão **antes → depois com a margem nova**. Executor: "patch" do produto (carregar o registro atual, trocar só o campo) — **DEPENDÊNCIA**: núcleo `patchProduct` (a ação da tela exige o formulário inteiro).

### 2.2.6 Consultas R0
"Quanto tenho do limpa-baú?", "o que está acabando?", "o que está sem estoque?": usa as consultas da página de Estoque. **Custo e margem só aparecem para quem tem `cost.view`.**

---

## 2.3 Subagente `servicos`
### `servico.cadastrar` (R1) — núcleo de `createServiceAction`
| Campo | Nível | Regra | Pergunta |
|-------|-------|-------|----------|
| nome | OBR | ≥ 2 letras; aviso de nome parecido | "Qual o nome do serviço?" |
| duração (horas e minutos) | **REC forte** | **Sem duração o serviço não pode ser agendado** (a Agenda recusa; nos testes o cadastro aceitava 0) | "Quanto tempo dura? (sem isso não consigo agendar)" |
| preço de venda | REC | ≥ 0 | "Qual o preço?" |
| preço de custo | REC (`cost.view`) | aviso se custo > preço | "Qual o custo?" |
| categoria | REC | — | — |
| descrição | opcional | — | — |
Cartão com margem. `servico.alterar_preco`/`alterar_duracao` (R2, `pricing.edit`) com antes → depois. Aviso ao alterar a duração: "agendamentos já marcados não mudam".

---

## 2.4 Subagente `clientes`
Permissão: qualquer membro (como a tela). Núcleos de `createCustomerAction`/`updateCustomerAction`.

### `cliente.cadastrar` (R1)
| Campo | Nível | Regra | Pergunta |
|-------|-------|-------|----------|
| nome | OBR | ≥ 2 letras; **aviso se já existe parecido** (mesmo nome ou mesmo telefone) | "Nome do cliente?" |
| telefone | REC | 8 a 15 números (regra do PR #90) | "Qual o telefone?" |
| WhatsApp | REC | mesma regra; pergunta "é o mesmo número?" | — |
| e-mail | opcional | formato válido | — |
| documento | opcional | **CPF/CNPJ com dígito verificador; não pode repetir** (PR #90); RG/outros aceitos sem checagem | "CPF ou CNPJ?" |
| aniversário | REC (alimenta o bônus de aniversário da Fidelidade) | passado | "Data de aniversário?" |
| endereço (CEP, rua, nº, complemento, bairro, cidade, UF) | opcional, **um grupo** | UF com 2 letras; CEP só dígitos | "Quer informar o endereço?" |
| observações / preferências | opcional | preferência = par "chave: valor", até 10 | — |
Cartão: todos os campos preenchidos; links; avisos (duplicata provável). Nunca envia CPF/telefone/e-mail ao modelo (mascarados na leitura).
### `cliente.alterar_contato` (R2)
Ficha: cliente (OBR), campos a mudar (OBR). Cartão **antes → depois** só dos campos alterados. Inativar cliente = **R2 na fase 7** (a tela chama de "Inativar").
### Consultas R0
"Telefone do João", "quando o João veio pela última vez", "pontos da Ana": ficha resumida; **não mostra documento completo** no chat (mostra mascarado).

---

## 2.5 Subagente `vendas`
Permissão: qualquer membro. É o **mais complexo**: a venda hoje é feita em vários passos (rascunho → itens → desconto → pontos → pagamentos → concluir), cada um uma ação separada.

### `venda.registrar` (R2)
| Campo | Nível | Regra |
|-------|-------|-------|
| itens | OBR (≥ 1) | cada item: produto **ou** serviço (entidade), quantidade (PAD 1), preço unitário (PAD do cadastro), desconto do item (opcional) |
| cliente | REC (pergunta uma vez; permite "sem cliente") | necessário para Fidelidade e para "a receber" [verificar se venda sem cliente pode ficar a receber] |
| pagamento | REC | já pago? forma (pix/dinheiro/débito/crédito/outro) + valor; **PAD "ficar a receber"**; pode dividir em vários pagamentos |
| desconto geral | opcional | ≥ 0 e ≤ subtotal |
| pontos de fidelidade | oferta **só se** o cliente tem saldo ≥ mínimo de resgate | "Ana tem 120 pontos (R$ 6,00). Usar?" |
| data | PAD hoje | **data retroativa não suportada** (a venda usa a data da conclusão) |
Conferências: estoque suficiente por item ("Estoque insuficiente para X (disponível: n)"); soma dos pagamentos ≤ total ("excede o saldo restante"); desconto ≤ subtotal; **caixa fechado com pagamento em dinheiro → aviso** ("esse dinheiro não entra em nenhum caixa; abrir o caixa antes?" — achado CX2 dos testes); total calculado igual ao da tela.
Cartão: itens (qtd × preço = subtotal), desconto, **total**, pagamentos, saldo a receber, cliente (link), pontos que serão ganhos (informativo), aviso de estoque que ficará baixo.
**DEPENDÊNCIA D5 (obrigatória antes de liberar):** hoje não existe função que faça a venda inteira numa transação; fazer pelas ações da tela em sequência pode deixar **rascunho órfão** ou venda concluída sem pagamento se falhar no meio. Criar `create_completed_sale(p_payload jsonb, p_idempotency_key)` (padrão de `complete_appointment`): cria venda, itens, desconto, pontos, pagamentos e conclui **tudo ou nada**, reutilizando as mesmas funções internas (`recalculate_sale_totals`, `add_sale_payment`, `complete_sale`, resgate). Bateria SQL no TEST com falha simulada em cada etapa.
Fidelidade: a conclusão gera os pontos pelo gatilho existente (inclui a correção do bônus de primeira compra do PR #90).
Resultado: link da venda + "Registrar outra".
### Consultas R0
"Quanto vendi hoje/no mês?", "vendas do João", "a receber": totais e lista curta com link.
### `venda.cancelar` (R3): fase 7, com motivo obrigatório e confirmação reforçada (estoque volta, estorna no Financeiro e no caixa, reverte pontos).

---

## 2.6 Subagente `financeiro`
Permissão: **`finance.view` (gerente/dono)** para tudo; funcionário recebe "esse assunto é do perfil gerente/dono".
### `financeiro.lancar` (R1) — `create_financial_entry(p_direction, p_description, p_amount, p_occurred_on, p_method, p_category_id, p_cost_center_id, p_notes)`
| Campo | Nível | Regra | Pergunta | Padrão |
|-------|-------|-------|----------|--------|
| tipo | OBR | despesa/receita; **inferir por verbo** ("paguei", "gastei", "comprei" = despesa; "recebi", "entrou" = receita); na dúvida pergunta | "É uma despesa ou uma receita?" | — |
| valor | OBR | > 0; aceita "1.234,56", "mil e duzentos"; ≤ limite do banco | "Qual o valor?" | — |
| descrição | OBR | ≥ 2 letras | "O que foi?" | — |
| data | PAD | hoje; futuro > 30 dias = aviso | — | hoje |
| forma | REC | pix/dinheiro/débito/crédito/outro | "Pagou como?" | outro [verificar o padrão da tela] |
| categoria | REC | **sugerida por palavra-chave** ("aluguel" → Aluguel e condomínio; "imposto/DAS" → Impostos; "salário/vale" → Pessoal; "luz/água/internet" → Despesas operacionais) | "Categoria? (sugiro Aluguel e condomínio)" | sem categoria |
| centro de custo | opcional | Geral / Loja Centro | — | Geral |
| observação | opcional | — | — | — |
Cartão: tipo em cor (despesa/receita), valor grande, descrição, data, forma, categoria, centro. **Teto D8:** acima de R$ 1.000 pede segunda confirmação.
Atenção: quando o lançamento for **dinheiro** e o usuário disser "tirei do caixa", propor `caixa.movimento` em vez de lançamento solto (evita duplicidade entre Caixa e Financeiro, achado CX4).
### `financeiro.pagar_conta` (R2) — `pay_accounts_payable(p_payable_id, p_amount, p_method, p_payment_date, p_notes)`
Ficha: conta a pagar (OBR; resolve por fornecedor/valor/vencimento; mostra candidatas com vencimento), valor (PAD: saldo), forma (OBR), data (PAD hoje). Aviso de pagamento parcial; recusa valor acima do saldo.
### `financeiro.receber` (R2) — `receive_sale_payment(p_sale_id, p_amount, p_method, p_paid_at, p_notes)`
Ficha: venda a receber (OBR; resolve por cliente/valor), valor (PAD: saldo), forma (OBR). Aviso se dinheiro com caixa fechado.
### Consultas R0
"Contas a pagar da semana", "a receber vencidos", "resultado do mês", "últimos lançamentos": KPIs + tabela curta (mesmos números do Financeiro).

---

## 2.7 Subagente `caixa`
Permissões do app: abrir = todos; **movimento manual = gerente/dono**; fechar = quem abriu ou gerente/dono.
### `caixa.abrir` (R1) — `open_cash_register(p_opening_balance, p_notes)`
Ficha: saldo inicial (OBR; pergunta, não assume 0), observação (opcional). Recusa se já houver caixa aberto.
### `caixa.movimento` (R2) — `create_cash_movement(p_direction, p_amount, p_method, p_description)`
| Campo | Nível | Regra |
|-------|-------|-------|
| tipo | OBR | entrada (suprimento) / saída (sangria, despesa); inferir por verbo |
| valor | OBR | > 0 |
| forma | PAD dinheiro | — |
| descrição | OBR | — |
Conferências: **caixa aberto**; **saída em dinheiro ≤ saldo esperado em espécie** (regra do PR #90). Cartão mostra saldo antes → depois.
### `caixa.consultar` (R0)
Saldo esperado em espécie, entradas por forma, última movimentação.
### `caixa.fechar` (R3, fase 7)
Ficha: valor contado (OBR). Cartão reforçado: esperado, contado, **diferença**, "não pode ser reaberto"; confirmação digitando CONFIRMAR.

---

## 2.8 Subagente `compras` (Compras e Fornecedores)
Permissão: **gerente/dono** (`purchases.view`, `suppliers.view`).
### `fornecedor.cadastrar` (R1)
nome OBR; documento REC (CPF/CNPJ **com dígito verificador e único**, PR #90); telefone/WhatsApp/e-mail REC; endereço opcional; observações; status ativo.
### `compra.criar` (R1) — `create_purchase_order(p_supplier_id, p_items jsonb, p_expected_at, p_due_date, p_notes)`
Ficha: fornecedor (OBR), itens (OBR: produto, quantidade, **custo unitário**), previsão de recebimento (REC), vencimento da conta a pagar (REC), observações. Formato do `p_items` **[verificar na migration 026]**. Cartão: itens, total, datas, "o estoque só muda no recebimento".
### `compra.receber` (R2) — `receive_purchase_order(p_purchase_order_id, p_items jsonb, p_notes)`
Ficha: pedido (OBR; resolve por fornecedor/número), itens recebidos e quantidades (PAD: saldo todo), observações. Recusa quantidade acima do saldo ("A quantidade recebida excede o saldo do item"). Cartão mostra **estoque antes → depois** e a conta a pagar que será gerada. Aviso conhecido: o recebimento **troca o custo do produto pelo último preço pago** (achado P3).
### Cancelar pedido / estornar recebimento: R3, fase 7.

---

## 2.9 Subagente `rh`
Permissão: **`hr.manage` (gerente/dono)**; funcionário nunca vê nada de RH pelo chat. **Fase final** (dados sensíveis).
### `rh.lancar_ajuste` (R2) — `hr_add_adjustment(p_employee_id, p_kind, p_amount, p_occurred_on, p_description, p_method)`
Ficha: funcionário (OBR, entidade `funcionario`), tipo (OBR: **vale** = advance, **desconto** = deduction, **bônus** = bonus; inferir da palavra), valor (OBR > 0), data (PAD hoje), descrição (REC), forma (OBR **só para vale**; as outras ficam sem forma — regra da tela). Cartão: funcionário, tipo, valor, **efeito no próximo fechamento** (vale desconta do pagamento; bônus soma).
### `rh.presenca` (R2) — `hr_set_attendance(p_employee_id, p_work_dates, p_quantity)`
Só funcionário **informal**; datas **não podem ser anteriores à admissão**; quantidade conforme a forma de pagamento (dia, hora). Cartão lista as datas.
### Consultas R0
"Quem recebo essa semana?", "quanto devo de folha?": lista de pagamentos a fazer. **Não mostra salário detalhado no chat**: só valores a pagar.
Fora do chat: fechar folha, pagar, férias, 13º, rescisão (R3 e complexos).

---

## 2.10 Consultas entre módulos
Intenções R0 curtas e de alto valor, entregues cedo (fase 2–3) porque **não alteram nada**: "o que tenho amanhã", "quanto vendi hoje", "saldo do caixa", "o que está acabando", "a receber vencido". Cada uma reaproveita a consulta da tela do módulo; o cartão `info` traz KPI + até 5 linhas + botão "Abrir {módulo}".

## 2.11 Dependências de banco e de código (consolidado)
| Id | Item | Tipo | Quem precisa | Observação |
|----|------|------|--------------|-----------|
| M1 | Tabelas `chat_*` + RLS + índices | migration | todos | rollback + bateria SQL de isolamento |
| M2 | `aliases` + índice GIN; extensões `pg_trgm`, `unaccent` | migration | todos | **verificar extensões antes** |
| M3 | `adjust_product_stock_delta` (D6) | migration | produtos | evita erro de concorrência |
| M4 | `create_completed_sale` (D5) | migration | vendas | **bloqueia a liberação de Vendas** |
| M5 | Extração de núcleos (`createAppointmentCore`, `createProductCore`, `patchProduct`, `createCustomerCore`, etc.) | código | agenda, produtos, clientes | refator pequeno, com os testes atuais como rede |
| M6 | Consulta de horários livres | código | agenda | só leitura; a gravação revalida |
| M7 | Rate limit e cota (`chat_usage`) | migration + código | todos | não existe hoje |
| M8 | Flag de plano "Chat AI" | código/dados | todos | D7; usa o gerenciamento de planos existente |
| M9 | Rotina de retenção de mensagens | migration/agendador | todos | padrão 90 dias |
Regras gerais: nenhuma migration em Production sem "Autorizo" por migration; PR que dependa de função nova só é mesclado **depois** de a migration estar aplicada (lição já registrada).
