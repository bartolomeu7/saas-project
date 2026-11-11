# Chat AI — 10 rodadas de observação para melhorias (11/11/2026)

**Objetivo (pedido do dono):** achar melhorias de funcionamento e de automação, bugs e erros. Não é pass/fail: cada conversa é lida e julgada.

**Como foi:** 10 rodadas × 20 conversas = **200 conversas**, com o catálogo, os clientes (telefones) e a agenda **reais da empresa de teste (teste1, lidos de produção)** + 2 profissionais extras para exercitar escolha de profissional, no **mesmo motor que está no ar** (`runAgendarTurn`). Ficou em `tests/chat-bateria/rodadas.mjs` (+ `fixture-teste1.mjs`).

> **Por que não pelo site:** a empresa de teste já tinha gasto 186 das 200 mensagens diárias na bateria anterior. Subir o limite exige mexer na Vercel (precisa do seu "Autorizo"), então as 200 conversas rodaram no motor com os dados reais; a verificação final no site fica para depois do deploy, com poucas mensagens.

| Rodada | Tema |
|---|---|
| 1 | Linguagem coloquial e erros de digitação |
| 2 | Voz: sem pontuação, hesitações, números por extenso, "cedo", "depois do almoço", "agora" |
| 3 | Informação fora de ordem, frases longas, lista com vírgulas, "campo: valor" |
| 4 | Datas relativas avançadas |
| 5 | Valor, duração, observação, intervalo |
| 6 | Clientes: telefone, título, sobrenome extra, apelido |
| 7 | Vários serviços/profissionais, "qualquer um", fim do expediente |
| 8 | Conflitos e como a pessoa responde às sugestões |
| 9 | Correções depois do resumo |
| 10 | O que o usuário vai pedir e o chat ainda não fazia |

## O que a leitura das 200 conversas mostrou (antes)

**Bugs (resultado errado):** "quinze para as onze" virava 15:00 e "dez para as quatro da tarde" virava 22:00; "ao meio dia e meia" virava 12:00; "20-12" virava 20/11; "quarta-feira da semana que vem" perguntava o dia; "essa sexta", "mês que vem", "em 2027" quebravam o nome do cliente; "às 9h até 13h" ignorava o fim; "duração 45 minutos" escolhia o serviço "Teste Duracao"; "cancelar o corte do João" e "reagendar…" **abriam um agendamento**; "agendar" repetido dizia "não encontrei o serviço agendar".

**Coisas ditas e ignoradas em silêncio (o pior tipo de falha):** valor ("por R$ 35", "grátis", "10% de desconto"), duração ("por 1 hora"), observação ("obs: cliente VIP"), "toda semana", "duplica para a Beatriz".

**Automação que faltava:** o chat perguntava "quem vai fazer?" mostrando profissionais ocupados; não escolhia "qualquer profissional"; depois de um conflito não entendia "o 2", "o primeiro livre", "com a Ana então" nem "no mesmo horário"; "de manhã"/"cedo" só perguntava a hora (sem mostrar os horários livres); não reconhecia o cliente sem "para" ("corte do joão paulo amanhã 15h"), nem por telefone ("do final 7777"), nem com título ("Dr. João"), erro de digitação ou sobrenome a mais; não aceitava "adiar uma hora", "outro cliente", "recomeçar", "tá certo"; consultas (horários livres, agenda do dia, preço, duração, quem faz, lista de serviços) respondiam "só agendo".

## Melhorias feitas (PR desta rodada)

1. **Tolerância a erro de digitação** (verbo, serviço, cliente, profissional): "agendr", "polimeto", "viniscius".
2. **Cliente sem "para"**: acha pelo nome no texto, por maiúsculas, por telefone ("final 7777"), ignora títulos (Dr., dona), tenta sem o último sobrenome, a vírgula encerra o nome, "agendar a X para serviço".
3. **Hora/data**: "N para as H", "meio dia e meia", "seg 14h", "20-12", "semana que vem", "fim do mês", "agora", "até 13h", "cedo", "depois do almoço", "antes do almoço", "fim da tarde", "anteontem".
4. **Valor, duração, observação** entram no resumo ("valor 80", "por R$ 35", "grátis", "10% de desconto", "por 1 hora", "duração 45 minutos", "obs: …"); o que ainda não existe (recorrência, duplicar, desconto sem valor) **é avisado**, não ignorado.
5. **Profissional inteligente:** só lista quem está livre naquele horário (1 livre → escolhe), "qualquer profissional/quem estiver livre/tanto faz" escolhe o primeiro livre, "Ana e Felipe" pergunta qual, cita sem gatilho ("Ana Paula, corte, …").
6. **Faixa do dia mostra horários:** "amanhã de manhã/cedo/à tarde" já lista os horários livres e aceita "o 2" ou "o primeiro livre".
7. **Conflito:** "com a Ana então" e "no mesmo horário" reaproveitam o horário; "Ninguém atende em sábado" quando o problema é o dia; fim de expediente explica a duração.
8. **Depois do resumo:** "adiar uma hora", "30 minutos mais cedo", "outro cliente/serviço/profissional/horário/dia", "recomeçar", "voltar", "tá certo".
9. **Vários serviços ("corte e barba"):** agenda um por vez e avisa.
10. **Consultas (somente leitura, sem Confirmar):** horários livres por profissional/serviço, agenda do dia ("o que eu tenho amanhã?"), preço, duração, quem faz, lista de serviços/profissionais.
11. **Conversa:** oi/bom dia, obrigado, ajuda; cancelar/reagendar/cadastrar cliente/vendas/financeiro explicam onde fazer; o exemplo usa um serviço da própria empresa.

**Depois:** 0 exceções nas 200 conversas; 951 testes unitários (23 novos em `chat-rodadas-melhorias.test.mjs` com o catálogo real).

## O que ainda fica para decidir / próximas funções
1. **Cancelar e reagendar por aqui** (hoje orienta ir à Agenda). Risco R2: precisa de confirmação e de função no banco; é o pedido mais natural depois de agendar. *Recomendo a próxima função.*
2. **Cadastrar cliente** por aqui (hoje só dentro de um agendamento). *Recomendo junto.*
3. **Agendamento recorrente** ("toda terça") e **2 serviços no mesmo horário**: precisam de regra do dono (tempo entre os serviços? mesmo profissional?).
4. **Registrar as gravações no log de auditoria** (migration em Production, pendente do seu "Autorizo").
5. **Limite diário** (200/empresa): uma bateria grande esgota. Para uso normal é folgado; manter. Se quiser testes reais pelo site em volume, autorize subir temporariamente na Vercel.
6. **Piloto com 2–3 empresas reais** antes de ampliar funções.
