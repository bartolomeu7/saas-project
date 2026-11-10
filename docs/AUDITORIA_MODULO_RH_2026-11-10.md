# Auditoria do módulo RH — 10/11/2026

**O que foi auditado:** o módulo RH inteiro (fases 1 Informal, 2 CLT e 3 Férias/13º) — 7.530 linhas: 3 migrações, 14 funções de banco, 7 tabelas, 7 páginas, 6 formulários e as bibliotecas de cálculo.

**Como:** leitura do código, consulta ao catálogo do banco (RLS, privilégios, índices, `search_path`), avisos de segurança do Supabase e **testes no banco TEST para provar cada suspeita** (transações descartadas, nada persistido).

**Resultado em uma frase:** a base está sólida — segurança, isolamento entre empresas e as contas de dinheiro estão certas e provadas —, mas há **1 bug grave que trava o uso do módulo**, 1 pendência de publicação e 7 inconsistências que atrapalham quem usa.

**O que esta auditoria não cobriu:** teste logado no site (a sessão do navegador de teste caiu no login e eu não entro na sua conta), acessibilidade a fundo e teste de carga.

---

## 0. Situação agora (antes dos achados)

O código da fase 3 (férias e 13º) **está no ar**, mas o banco de Production **não tem** a migração: conferido agora, lá não existem a tabela `hr_vacations` nem as 4 funções novas.

| | Production | TEST |
|---|---|---|
| Tabelas do RH | 7 | 8 (com `hr_vacations`) |
| Funções do RH | 14 | 18 |
| Férias/13º | **não existe** | existe |

**Efeito:** as telas do RH continuam abrindo (as consultas devolvem lista vazia em vez de quebrar), mas **programar férias, gerar recibo de férias e gerar parcela do 13º falham** com uma mensagem técnica. O resto do RH (funcionários, presença, vales, folha do mês, pagamentos) funciona normalmente.

---

## 1. GRAVE — depois de gerar o 13º, a folha do mês trava o ano inteiro

**O que acontece:** a parcela do 13º é gravada com período de 01/01 a 31/12 do ano. A tela da folha pergunta ao banco "já existe pagamento que cubra este mês?" **sem filtrar o tipo** — então o 13º "cobre" os 12 meses. A aba *Folha do mês* passa a dizer "Este mês já tem um pagamento fechado" e **esconde o botão de fechar a folha** para qualquer mês do ano.

**Prova (TEST, transação descartada):** funcionário CLT, gerada a 1ª parcela do 13º de 2026. Depois disso:

| Mês | A tela diz que já tem pagamento | O banco bloqueia |
|---|---|---|
| 01 a 12/2026 (todos) | **sim** | não |

E o banco realmente deixou fechar a folha de setembro/2026 (líquido R$ 3.000,00) — ou seja, **só a tela bloqueia**.

**O mesmo vale para férias:** um recibo de férias de março bloqueia a folha de março na tela.

**Onde:** `src/lib/hr/queries.ts`, função `hasPaymentInMonth` — falta `.in("kind", ["period", "payroll"])`, que é exatamente o filtro que as três funções do banco já fazem.

**Correção:** uma linha. Mesma correção em `getLastClosedPeriodEnd` e `getEarliestUnsettledDay` por coerência (hoje sem efeito prático, porque só o modo informal as usa).

**Por que passou:** os 654 testes cobrem o cálculo e as regras do banco, mas **nenhuma consulta de leitura do app tem teste**.

---

## 2. GRAVE (operacional) — código da fase 3 publicado sem a migração

Descrito na seção 0. **Correção:** aplicar `20261108180000_hr_vacation_13th` em Production (precisa da sua autorização). Enquanto não for aplicada, qualquer tentativa de usar férias/13º mostra erro técnico ao usuário.

---

## 3. MÉDIO — o holerite mostra dias de férias como "Faltas"

**O que acontece:** quando o funcionário tira férias no meio do mês, você informa os dias de férias na folha para que o salário desses dias saia (eles são pagos no recibo de férias). O cálculo está **certo**, mas o holerite salvo soma faltas + dias de férias num campo só, rotulado **"Faltas"**.

**Prova (TEST):** 1 falta + 10 dias de férias, salário R$ 3.000 → o holerite grava `Faltas = R$ 1.100,00` (R$ 100 de falta + R$ 1.000 de férias), enquanto a entrada registra "faltas=1, férias=10".

**Efeito:** o papel que o funcionário assina diz que ele faltou 11 dias. Líquido correto, descrição errada.

**Onde:** `src/lib/hr/actions.ts` (manda `faltas + férias` como um número só) e a página do pagamento, que mostra esse total como "Faltas".

**Correção:** mandar os dois valores separados para o banco e mostrar duas linhas no holerite ("Faltas" e "Dias de férias — pagos no recibo"). Mexe na função do banco (uma coluna nova no retrato do cálculo) e na página.

---

## 4. MÉDIO — o aviso de férias ignora o direito reduzido por faltas

**O que acontece:** o painel para de avisar "férias vencidas/vencendo" quando o funcionário tem **30 dias** programados. Se o direito caiu para 24, 18 ou 12 dias por causa das faltas (regra do art. 130, que o módulo aplica corretamente), o aviso **nunca some**, mesmo com tudo programado.

**Prova (TEST):** funcionário com 10 faltas → direito de 24 dias, 24 programados. O aviso continuaria aparecendo.

**Onde:** `src/lib/hr/queries.ts`, `getHrAlerts` — compara com 30 fixo em vez do `entitled_days` gravado nas férias.

**Correção:** pequena (usar o direito do próprio período).

---

## 5. MÉDIO — recibo de férias e do 13º sem a composição

Só a folha mensal tem holerite detalhado. Férias e 13º caem no recibo genérico, que:

- mostra **"Dias trabalhados"** onde deveria dizer dias de férias (e zero no 13º);
- **não destaca o 1/3 constitucional** — ele fica embutido no "Valor bruto";
- junta INSS e IRRF num "Descontos" único, sem discriminar;
- no 13º, não diz qual parcela nem os avos.

Para um papel que o funcionário assina, é fraco — e o 1/3 é justamente o que ele espera conferir.

**Correção:** dois blocos novos na página do pagamento (os dados já estão gravados no retrato do cálculo; é só exibir).

---

## 6. MÉDIO — a lista de pagamentos não diz o que é cada pagamento

Na ficha do funcionário os pagamentos aparecem com nome ("Folha 11/2026", "Férias 10/03 a 23/03", "13º — 1ª parcela"). Mas **a lista geral** (`/app/rh/pagamentos`) e o painel mostram só o período: o 13º aparece como "01/01 a 31/12/2026" e férias como um intervalo qualquer. Quem olha a lista não distingue folha de férias ou 13º.

**Correção:** usar na lista o mesmo rótulo da ficha (função já existe) e, de quebra, um filtro por tipo.

---

## 7. MÉDIO — regra de férias duplicada em código que nunca roda

As regras de divisão de férias (até 3 períodos, mínimo de 5 dias, um de 14+) e a tabela de faltas existem **duas vezes**: no banco (que é quem decide) e em `payroll.ts` (`validateVacationSplit`, `vacationEntitledDays`), que **nenhuma tela usa** — confirmado por varredura: 0 usos.

Dois problemas: as duas cópias podem divergir com o tempo, e a tela **não valida nada antes de enviar** — a pessoa preenche, envia e só então descobre que a divisão é inválida.

**Correção:** usar essas funções no formulário (aviso imediato, antes de enviar) ou removê-las. A primeira opção é melhor e aproveita os testes que já existem.

---

## 8. MÉDIO — as tabelas de INSS/IRRF envelhecem em silêncio

O módulo busca a tabela vigente "mais recente até o mês". Hoje só existe a de **01/01/2026**. Em janeiro de 2027, sem ninguém inserir a tabela nova, **ele continua calculando com a de 2026, sem erro e sem alerta** — só uma linha em letra miúda dizendo "Tabelas vigentes desde 01/01/2026".

Agravante: não há tela para cadastrar a tabela nova. Só por acesso administrativo ao banco.

**Correção:** (a) alerta visível quando a tabela vigente for de ano anterior ao da folha; (b) um lembrete anual; (c) idealmente, uma tela de administração para as tabelas.

---

## 9. MENOR — mensagem técnica do banco aparece para o usuário

13 pontos devolvem a mensagem do banco direto para a tela. Para erro de regra está ótimo (as mensagens foram escritas em português, para leigo). Para erro técnico (como agora, com a migração faltando) vaza jargão de programador. É o padrão do resto do projeto, mas aqui a chance de acontecer é maior.

---

## 10. Melhorias de processo (não são erros)

| # | Melhoria | Ganho |
|---|---|---|
| a | **Fechar a folha de vários funcionários de uma vez** (hoje é um a um) | numa equipe de 5, são 5 telas por mês |
| b | **Puxar os dias de férias automaticamente** para a folha do mês (hoje é digitado à mão, podendo divergir das férias programadas) | menos erro e menos digitação |
| c | **Imprimir holerites/recibos em lote** | hoje é um por vez |
| d | **Filtro por tipo e paginação** na lista de pagamentos; **paginação** na lista de funcionários (hoje sem limite) | escala |
| e | **Vincular o funcionário do RH ao membro da equipe e ao profissional da agenda** — estava previsto no plano e não foi implementado | abre caminho para comissão vir para o RH |
| f | **Exportação para o contador** e **rescisão** | já previstos nas próximas fases |
| g | **13 chaves estrangeiras sem índice**, com destaque para `company_id` nas tabelas filhas (usado pela segurança por linha) e `payment_id` em férias | hoje irrelevante (tabelas pequenas), importa quando crescer |
| h | **Dois caminhos de escrita de funcionário**: o informal grava direto na tabela, o CLT passa por função. Unificar reduz superfície | consistência |
| i | **Teste para as consultas de leitura** — a lacuna que deixou passar o bug nº 1 | evita repetição |

---

## 11. O que está correto (verificado, não suposto)

- **Segurança por linha** em todas as 8 tabelas, todas com política; **nenhuma** função do RH é executável por visitante anônimo; todas as funções com `search_path` fixo. Zero avisos do Supabase apontando para o RH.
- **Isolamento entre empresas** provado nas 3 baterias (uma empresa não vê nem mexe em funcionário de outra).
- **Dinheiro**: pagamento é idempotente, não duplica lançamento, respeita caixa aberto para dinheiro e usa o caminho único do Financeiro. Provado nas baterias.
- **Contas**: INSS, IRRF (com a redução da Lei 15.270), FGTS, VT, férias com 1/3 e 13º conferem com os exemplos oficiais do gov.br — e os exemplos viraram teste.
- **Rollback** das 3 migrações provado, e o da fase 3 se recusa a apagar dados em silêncio.
- **Tabelas de imposto versionadas no banco**, sem número de alíquota escrito no código (teste garante isso).

---

## 12. Ordem sugerida de correção

1. **Aplicar a migração da fase 3 em Production** (destrava férias e 13º).
2. **Bug nº 1** (uma linha) — destrava a folha do mês; é o que impede usar o módulo depois do 13º.
3. **Nº 3 e nº 4** (holerite com férias como falta; aviso de férias) — erros visíveis para quem usa.
4. **Nº 5 e nº 6** (recibos de férias/13º e rótulo nas listas) — qualidade do que o funcionário assina.
5. **Nº 7 e nº 8** (validação na tela e alerta de tabela velha) — evitam problema futuro.
6. Melhorias do item 10, por valor.

Os itens 2, 3, 4, 6 e 7 cabem num PR só, com testes cobrindo a lacuna do item 10-i.

## 13. Status das correções

Todos os achados 1 a 9 foram corrigidos no PR da auditoria (branch fix/rh-auditoria-2026-11-10). Ficam como melhorias futuras os itens 10 a, b, c, d, e, f e h (lote, férias automáticas na folha, impressão em lote, paginação, vínculo com Equipe/Agenda, exportação para o contador e unificar a escrita do funcionário).
