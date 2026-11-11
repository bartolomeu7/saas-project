/**
 * Chat AI — 10 rodadas de OBSERVAÇÃO (200 conversas) para achar melhorias. Usa o catálogo/agenda reais da empresa de teste
 * (teste1) lidos de produção e o MESMO motor que está no ar. Não pass/fail: imprime a conversa para ser analisada.
 *   node --no-warnings --experimental-strip-types tests/chat-bateria/rodadas.mjs [rodada...]
 */
import { runAgendarTurn, emptyState } from "../../src/lib/chat/agenda-turn.ts";

import { CLOCK, CATALOG, PORTS } from "./fixture-teste1.mjs";

const R = {};
const add = (n, ...convs) => (R[n] = convs.map((c) => (Array.isArray(c) ? c : [c])));

add(1, // linguagem coloquial e erros de digitação
  "agendr polimento pra Juliana amanha as 10", "agenda um polimeto pra juliana sexta 14h", "marca escova pra juliana ferreira na sexta de tarde às 14",
  "quero marca uma hidratação pro marcos viniscius quinta 9h", "bora agendar o polimento da Beatriz terça 14h", "agend polimento beatriz cavalcanti seg 14h",
  "me vê um horario de corte pro joao pedro amanha 10h", "ei, marca uma barba pro João Paulo amanhã às 15h com a Ana", "AGENDA CORTE MASCULINO PRO JOÃO PEDRO AMANHÃ 11H",
  "agendar corte masculino pro joao amanha 10h", "agendar corte pro joão pedro santos amanhã às 10", "corte do joão paulo amanhã 15h", "faz um corte e barba pro João Pedro amanhã 10h",
  "Agendar corte pro João Pedro amanhã às 10h por favor, obrigado!", "agendar corte para joao pedro amanha as dez e meia", "marcar corte joão paulo lima quinta-feira às 16h com o Felipe",
  "preciso de um corte pro joão pedro, tem horário amanhã de manhã?", "tem horário pra polimento sexta?", "quero agendar", "agendar um negócio pra amanhã");

add(2, // voz: sem pontuação, hesitações, números por extenso
  "agendar é corte masculino para joão pedro santos amanhã às dez horas", "agendar tipo polimento pra juliana ferreira nogueira é sexta às quatorze horas",
  "agendar hum escova progressiva para marcos vinícius albuquerque na quinta às nove e meia da manhã", "agendar corte para joão pedro amanhã às dez e quinze",
  "agendar corte para joão pedro amanhã às onze e quarenta e cinco", "agendar corte para joão pedro amanhã às quinze para as onze", "agendar corte para joão pedro amanhã às dez para as quatro da tarde",
  "agendar barba para joão pedro amanhã às duas e meia da tarde", "agendar barba pra joão pedro dia treze às nove", "agendar barba pra joão pedro no dia vinte às dez horas",
  "agendar barba pra joão pedro no dia trinta de novembro às dez", "agendar barba pra joão pedro segunda-feira que vem às nove", "agendar barba joão pedro amanhã cedo",
  "agendar barba joão pedro amanhã no fim da tarde", "agendar barba joão pedro amanhã ao meio dia e meia", "agendar barba joão pedro amanhã depois do almoço",
  "agendar barba joão pedro amanhã antes do almoço", "agendar barba joão pedro hoje à noite", "agendar barba joão pedro hoje mais tarde", "agendar barba joão pedro agora");

add(3, // informação fora de ordem / frases longas
  "amanhã às 10h com a Ana o João Pedro quer um corte", "Ana Paula, corte, João Pedro, amanhã, 10h", "10h amanhã corte João Pedro Ana",
  "o João Pedro Santos vai fazer um corte masculino amanhã às 10 horas com a Ana Paula Souza", "serviço: corte masculino; cliente: João Pedro Santos; profissional: Ana Paula; data: amanhã; hora: 10:00",
  "cliente João Pedro serviço barba dia 13/11 hora 09:30 profissional Felipe", "agendar corte masculino\nJoão Pedro\namanhã 10h\nAna", "olha, eu queria ver se dá pra marcar um corte pro João Pedro, de preferência amanhã de manhã, com a Ana, pode ser?",
  "já que a Ana está disponível amanhã, marca o João Pedro nela às 10h para corte", "se a Ana puder amanhã às 10, agenda corte pro João Pedro", "agenda pro João Pedro amanhã às 10h corte com Ana ou com Felipe",
  "corte pro João Pedro amanhã 10h e barba depois", "agenda corte e barba pro João Pedro amanhã às 10h", "João Pedro amanhã às 10h", "João Pedro", "amanhã às 10h", "Ana", "corte", "agendar corte masculino pro João Pedro amanhã às 10h com a Ana Paula Souza no valor de 60 reais", "agendar corte amanhã 10h João Pedro e já confirma");

add(4, // datas relativas avançadas
  "agendar barba para João Pedro essa sexta às 10h", "agendar barba para João Pedro sexta que vem às 10h", "agendar barba para João Pedro na próxima segunda às 10h", "agendar barba para João Pedro no dia 5 de dezembro às 10h",
  "agendar barba para João Pedro dia 5 às 10h", "agendar barba para João Pedro daqui a 15 dias às 10h", "agendar barba para João Pedro daqui a duas semanas às 10h", "agendar barba para João Pedro no fim do mês às 10h",
  "agendar barba para João Pedro mês que vem às 10h", "agendar barba para João Pedro em 20/12 às 10h", "agendar barba para João Pedro 20/12/2026 às 10h", "agendar barba para João Pedro dia 20-12 às 10h",
  "agendar barba para João Pedro 25 de dezembro às 10h", "agendar barba para João Pedro dia 29 de fevereiro às 10h", "agendar barba para João Pedro em 2027 dia 10 de janeiro às 10h", "agendar barba para João Pedro na quarta às 10h",
  "agendar barba para João Pedro na quarta-feira da semana que vem às 10h", "agendar barba para João Pedro depois de amanhã às 10h", "agendar barba para João Pedro anteontem às 10h", "agendar barba para João Pedro hoje às 13h");

add(5, // duração/valor/observação customizados
  "agendar corte para João Pedro amanhã das 10 às 11", "agendar corte para João Pedro amanhã das 10h às 10h30", "agendar corte para João Pedro amanhã às 10h por 1 hora", "agendar corte para João Pedro amanhã às 10h duração 45 minutos",
  "agendar corte para João Pedro amanhã às 10h valor 80 reais", "agendar corte para João Pedro amanhã às 10h por R$ 35", "agendar corte para João Pedro amanhã às 10h com desconto", "agendar corte para João Pedro amanhã às 10h grátis",
  "agendar corte para João Pedro amanhã às 10h observação alérgico a amônia", "agendar corte para João Pedro amanhã às 10h obs: cliente VIP", "agendar corte para João Pedro amanhã às 10h, ele vai levar o filho junto",
  "agendar corte para João Pedro amanhã às 10h e meia hora de intervalo", "agendar corte para João Pedro amanhã às 10h com a Ana", "agendar corte para João Pedro amanhã às 10h com o Felipe", "agendar corte para João Pedro amanhã às 10h com o Rafael",
  "agendar polimento para João Pedro segunda às 9h até 13h", "agendar polimento para João Pedro segunda das 14h às 18h", "agendar polimento para João Pedro segunda das 15h às 14h", "agendar corte para João Pedro amanhã das 10h às 10h", "agendar corte para João Pedro amanhã das 9 às 18");

add(6, // clientes avançados
  "agendar corte para o cliente do final 7777 amanhã às 10h", "agendar corte para o João do telefone 11988887777 amanhã às 10h", "agendar corte para o João Santos amanhã às 10h", "agendar corte para o Pedro Santos amanhã às 10h",
  "agendar corte para João amanhã às 10h", "agendar corte para joão p santos amanhã às 10h", "agendar corte para o JP amanhã às 10h", "agendar corte para Santos amanhã às 10h", "agendar corte para a Bia amanhã às 10h", "agendar corte para a Beatriz Duarte amanhã às 10h",
  "agendar corte para Beatriz C. Duarte amanhã às 10h", "agendar corte para o Dr. João Pedro amanhã às 10h", "agendar corte para a dona Juliana amanhã às 10h", "agendar corte para Juliana Nogueira amanhã às 10h", "agendar corte para joão pedro amanhã às 10h",
  "agendar corte para Joao Pedro Santos Junior amanhã às 10h", "agendar corte para Maria José amanhã às 10h", "agendar corte para a filha da Juliana amanhã às 10h", "agendar corte para mim amanhã às 10h", "agendar corte para o mesmo cliente de ontem amanhã às 10h");

add(7, // vários serviços/profissionais
  "agendar corte e barba para João Pedro amanhã às 10h", "agendar corte masculino, barba e hidratação para João Pedro amanhã", "agendar barba para João Pedro amanhã às 10h com Ana e Felipe", "agendar barba para João Pedro amanhã às 10h com qualquer profissional",
  "agendar barba para João Pedro amanhã às 10h com quem estiver livre", "agendar barba para João Pedro amanhã às 10h com o primeiro disponível", "agendar barba para João Pedro amanhã às 10h, tanto faz o profissional", "agendar polimento para João Pedro segunda às 10h",
  "agendar corte para João Pedro amanhã às 10h", "agendar corte para João Pedro amanhã às 9h30", "agendar escova para Juliana segunda às 10h", "agendar hidratação para Juliana segunda às 10h", "agendar hidratação para Juliana segunda às 17h",
  "agendar barba para João Pedro amanhã às 17h50", "agendar barba para João Pedro amanhã às 17h40", "agendar corte para João Pedro com a Ana amanhã às 17h30", "agendar corte para João Pedro com a Ana amanhã às 17h20", "agendar barba para João Pedro com Rafael amanhã às 13h", "agendar barba para João Pedro com Rafael amanhã às 15h30", "agendar barba para João Pedro com Rafael amanhã às 12h");

add(8, // conflitos e sugestões
  "agendar polimento para Juliana amanhã às 9h", "agendar polimento para Juliana amanhã às 13h", "agendar polimento para Juliana sexta às 9h", "agendar polimento para Juliana sexta às 9h15", "agendar polimento para Juliana segunda às 9h",
  "agendar corte para João Pedro segunda às 9h com Rafael", "agendar corte para João Pedro segunda às 9h45 com Rafael", "agendar corte para João Pedro terça às 10h com Rafael", "agendar corte para João Pedro terça às 10h15 com Rafael", "agendar corte para João Pedro terça às 9h45 com Rafael",
  ["agendar corte para João Pedro terça às 10h com Rafael", "e às 10h30?"], ["agendar corte para João Pedro terça às 10h com Rafael", "o primeiro livre"], ["agendar corte para João Pedro terça às 10h com Rafael", "qualquer horário de manhã"],
  ["agendar corte para João Pedro terça às 10h com Rafael", "outro dia"], ["agendar corte para João Pedro terça às 10h com Rafael", "quarta no mesmo horário"], ["agendar corte para João Pedro terça às 10h com Rafael", "com a Ana então"],
  ["agendar corte para João Pedro terça às 10h com Rafael", "o 2"], ["agendar corte para João Pedro terça às 10h com Rafael", "11:00"], ["agendar corte para João Pedro terça às 10h com Rafael", "às 11"], ["agendar corte para João Pedro terça às 10h com Rafael", "deixa pra lá"]);

add(9, // correções e fluxo
  ["agendar corte para João Pedro amanhã às 10h com Ana", "voltar"], ["agendar corte para João Pedro amanhã às 10h com Ana", "desfazer"], ["agendar corte para João Pedro amanhã às 10h com Ana", "recomeçar"], ["agendar corte para João Pedro amanhã às 10h com Ana", "outro cliente"],
  ["agendar corte para João Pedro amanhã às 10h com Ana", "mudar o serviço para barba"], ["agendar corte para João Pedro amanhã às 10h com Ana", "adiar uma hora"], ["agendar corte para João Pedro amanhã às 10h com Ana", "uma hora mais tarde"], ["agendar corte para João Pedro amanhã às 10h com Ana", "antecipar para 9h"],
  ["agendar corte para João Pedro amanhã às 10h com Ana", "mesmo horário na sexta"], ["agendar corte para João Pedro amanhã às 10h com Ana", "e repete toda semana"], ["agendar corte para João Pedro amanhã às 10h com Ana", "duplica para a Beatriz"],
  ["agendar corte para João Pedro amanhã às 10h com Ana", "aumenta o valor para 70"], ["agendar corte para João Pedro amanhã às 10h com Ana", "põe uma observação: trazer documento"], ["agendar corte para João Pedro amanhã às 10h com Ana", "não, é com o Felipe"],
  ["agendar corte para João Pedro amanhã às 10h com Ana", "ops, errei: é o João Paulo"], ["agendar corte para João Pedro amanhã às 10h com Ana", "tá certo"], ["agendar corte para João Pedro amanhã às 10h com Ana", "cancelar tudo"],
  ["agendar corte", "cancela", "agendar barba"], ["agendar", "agendar", "agendar"], ["oi", "agendar corte para João Pedro amanhã às 10h com Ana"]);

add(10, // capacidades que o usuário vai pedir (lacunas)
  "oi", "bom dia", "obrigado", "o que você faz?", "ajuda", "o que eu tenho amanhã?", "quais horários livres da Ana amanhã?", "tem horário livre hoje?", "cancelar o corte do João Pedro de amanhã",
  "reagendar o corte do João Pedro para sexta", "cadastrar o cliente Pedro Alves telefone 11 99999-0000", "quanto custa um corte?", "qual a duração do polimento?", "quem faz barba?", "listar meus serviços", "quantos agendamentos eu tenho hoje?",
  "faturamento de hoje", "vender um produto", "abrir caixa", "ligar para o João Pedro");

const only = process.argv.slice(2).map(Number).filter(Boolean);
for (const [n, convs] of Object.entries(R)) {
  if (only.length && !only.includes(Number(n))) continue;
  console.log(`\n===== RODADA ${n} =====`);
  let i = 0;
  for (const turns of convs) {
    i += 1;
    let state = emptyState();
    const lines = [];
    for (const t of turns) {
      try {
        const r = await runAgendarTurn({ text: t, state: JSON.parse(JSON.stringify(state)), catalog: CATALOG, clock: CLOCK }, PORTS);
        state = r.state;
        const card = r.messages.find((m) => m.kind === "confirm")?.card;
        const body = r.messages.filter((m) => m.kind !== "confirm").map((m) => `${m.kind}:${(m.text ?? "").replace(/Rafael Teixeira Lima é o único profissional que faz [^.]*\./, "").trim().slice(0, 95)}${m.options ? `{${m.options.slice(0, 4).map((o) => o.label.slice(0, 14)).join("/")}}` : ""}`).join(" ");
        const c = card ? ` ✔[${card.fields.slice(0, 4).map((f) => f.value.replace(/ \(Teste Completo\)/, "").slice(0, 28)).join(" | ")}${card.fields.find((f) => f.label === "Valor") ? ` | ${card.fields.find((f) => f.label === "Valor").value}` : ""}${card.warnings?.length ? " ⚠" : ""}]` : "";
        const sl = r.state.slots;
        const slots = card ? "" : ` «${[sl.servico && "S:" + sl.servico.name.split(" ")[0], sl.cliente && "C:" + (sl.cliente.isNew ? "NOVO " : "") + sl.cliente.name.split(" ")[0], sl.profissional && "P:" + sl.profissional.name.split(" ")[0], sl.date && sl.date.slice(5), sl.time, sl.endTime && "até " + sl.endTime, sl.dayPart, sl.priceOverride != null && "R$" + sl.priceOverride, sl.notes && "obs"].filter(Boolean).join(" ")}»`;
        lines.push(`${t.replace(/\n/g, "⏎").slice(0, 70)} → ${body}${c}${slots}`);
      } catch (e) {
        lines.push(`${t.slice(0, 60)} → EXCEÇÃO ${e.message}`);
      }
    }
    console.log(`${n}.${i} ${lines.join("  ⟶  ")}`);
  }
}
