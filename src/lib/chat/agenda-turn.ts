import { norm, tokens } from "./text.ts";
import { spokenNumbersToDigits } from "./numbers-pt.ts";
import { parseDateTimePt, formatDatePt, minutesOf, weekdayOf, type ChatClock } from "./datetime-pt.ts";
import {
  detectAgendar,
  eligibleProfessionals,
  extractCustomerText,
  formatDuration,
  effectiveDuration,
  matchProfessionals,
  matchServices,
  missingFields,
  nextQuestion,
  originalCustomerName,
  plausibleName,
  extractServiceText,
  unknownProfessionalRef,
  looseProfessionals,
  parseExtras,
  mentionedServices,
  withoutExtras,
  professionalSlot,
  suggestFreeStarts,
  summarizeAgendar,
  understandAgendar,
  validateAgendar,
  type AgendaCatalog,
  type AgendarField,
  type AgendarSlots,
  type CatalogProfessional,
  type Candidate,
  type ConfirmCard,
  type ProfessionalSchedule,
} from "./agenda-agendar.ts";

/**
 * Chat AI — um turno da conversa de `agenda.agendar`. Lógica pura: o banco entra por "portas" injetadas
 * (buscar clientes, carregar a agenda do profissional), então dá para testar a conversa inteira sem banco.
 * Devolve o novo estado e UMA lista de mensagens estruturadas (docs/chat-ai/01 §5).
 */

export type ChatMessage =
  | { kind: "ask"; text: string; options?: { id: string; label: string }[]; fields: AgendarField[] }
  | { kind: "disambiguate"; text: string; field: PendingField; options: { id: string; label: string; detail?: string }[] }
  | { kind: "confirm"; text: string; card: ConfirmCard }
  | { kind: "result"; text: string; link?: { href: string; label: string } }
  | { kind: "notice"; text: string }
  | { kind: "error"; text: string };

export type PendingField = "cliente" | "servico" | "profissional" | "data" | "hora";

export interface PendingChoice {
  field: PendingField;
  options: { id: string; label: string; detail?: string }[];
}

export interface AgendarState {
  slots: AgendarSlots;
  /** campos que a última pergunta cobria */
  asked: AgendarField[];
  /** escolha entre opções que a pessoa ainda precisa fazer */
  pending: PendingChoice | null;
  /** o assunto já foi reconhecido como agendamento */
  started: boolean;
  /** a pessoa disse "qualquer profissional": escolhe o primeiro livre quando o horário estiver definido */
  anyPro?: boolean;
  /** dia/horário que deu conflito: serve para "com a Ana então" e "no mesmo horário" */
  previous?: { date?: string; time?: string; endTime?: string };
  /** horários oferecidos na última pergunta ("o 2", "o primeiro livre") */
  lastOptions?: { id: string; label: string }[];
}

export const emptyState = (): AgendarState => ({ slots: {}, asked: [], pending: null, started: false });

export interface AgendarPorts {
  /** clientes ativos da empresa cujo nome combina com o texto (no máximo ~5) */
  findCustomers(text: string): Promise<Candidate[]>;
  /** clientes INATIVOS que combinam com o texto (para avisar em vez de oferecer um cadastro duplicado) */
  findInactiveCustomers?(text: string): Promise<Candidate[]>;
  /** agenda do profissional no dia (expediente, bloqueios, ocupados); null se não houver como carregar */
  loadSchedule(professionalId: string, date: string): Promise<ProfessionalSchedule | null>;
  /** clientes cujo nome aparece no texto (sem "para/pro"): "corte do joão paulo amanhã 15h" */
  findCustomersInText?(text: string): Promise<Candidate[]>;
  /** clientes pelo final do telefone ("o cliente do final 7777") */
  findCustomersByPhone?(digits: string): Promise<Candidate[]>;
  /** agendamentos do dia (para "o que eu tenho amanhã?"); só leitura */
  loadDayAppointments?(date: string): Promise<DayAppointment[]>;
}

export interface DayAppointment {
  start: string;
  end: string;
  customer: string;
  service: string;
  professional: string;
  status: string;
}

export interface TurnInput {
  text: string;
  /** clique numa opção: tem prioridade sobre o texto */
  choice?: { field: PendingField; id: string };
  state: AgendarState;
  catalog: AgendaCatalog;
  clock: ChatClock;
}

export interface TurnResult {
  state: AgendarState;
  messages: ChatMessage[];
  status: "coletando" | "aguardando_confirmacao";
  missing: AgendarField[];
  blocks: string[];
  warnings: string[];
}

const CANCEL_WORDS = /\b(cancela|cancelar|deixa pra la|deixa para la|esquece|desisto|nao quero mais)\b/;

/** "1", "2", nome ou parte do nome → opção escolhida (ou null). */
export function pickOption<T extends { id: string; label: string }>(text: string, options: T[]): T | null {
  const t = norm(text).replace(/[.!?]+$/g, "").trim();
  const num = /^(?:opcao |numero |n )?(\d{1,2})$/.exec(t);
  if (num) return options[Number(num[1]) - 1] ?? null;
  const wanted = new Set(tokens(text));
  if (wanted.size === 0) return null;
  const hits = options.filter((o) => tokens(o.label).some((tok) => wanted.has(tok) || [...wanted].some((w) => w.length >= 3 && tok.startsWith(w))));
  return hits.length === 1 ? hits[0]! : null;
}

const NEW_PREFIX = "novo:";
const OTHER_NAME = "outro-nome";

const asOptions = (c: Candidate[]) => c.map((x) => ({ id: x.id, label: x.name, detail: x.detail }));

const ANY_PRO = /\b(qualquer (profissional|um|uma|pessoa|atendente)|quem (estiver|tiver|puder) (livre|disponivel|atender)|(o |a )?primeiro (profissional )?(disponivel|livre)|tanto faz( o| a| quem)?( profissional)?|(o|a) que (estiver|tiver) (livre|disponivel)|sem preferencia)\b/;
const AFFIRMATIVE = /^(sim|confirmo|confirmar|confirma|confirma isso|confirmado|pode|pode confirmar|pode ser|ok|ok pode|isso|isso mesmo|fechado|certo|ta certo|esta certo|ta bom|beleza|blz|show|perfeito|combinado)$/;
const ORDINALS: Record<string, number> = { primeiro: 1, primeira: 1, segundo: 2, segunda: 2, terceiro: 3, terceira: 3, quarto: 4, quarta: 4, quinto: 5, quinta: 5 };

/** "o 2", "2", "o segundo", "o primeiro livre", "o último" → uma das opções oferecidas (ou null). */
export function pickOffered(text: string, options: { id: string; label: string }[]): { id: string; label: string } | null {
  const t = norm(text).replace(/[.!?]+$/g, "").trim();
  if (!t || t.split(" ").length > 4) return null;
  const num = /^(?:o |a |opcao |numero |n )?(\d{1,2})$/.exec(t);
  if (num) return options[Number(num[1]) - 1] ?? null;
  const ord = /^(?:o |a )?(primeiro|primeira|segundo|segunda|terceiro|terceira|quarto|quinto)(?: (?:livre|horario|disponivel|da lista))?$/.exec(t);
  if (ord) return options[ORDINALS[ord[1]!]! - 1] ?? null;
  if (/^(?:o |a )?(ultimo|ultima)(?: (?:livre|horario|disponivel))?$/.test(t)) return options[options.length - 1] ?? null;
  return null;
}

/** Quantos minutos adiar (+) ou antecipar (−): "adiar uma hora", "30 minutos mais cedo". null se não pediu. */
export function parseShift(t0: string): number | null {
  const t = spokenNumbersToDigits(t0);
  const later = /\b(adiar|atrasar|empurrar|passar|mais tarde|depois)\b/.test(t);
  const earlier = /\b(antecipar|adiantar|puxar|mais cedo|antes)\b/.test(t);
  if (!later && !earlier) return null;
  let minutes: number | null = null;
  const h = /(\d+)\s*(?:h|horas?)\b(?:\s*e\s*(meia|\d{1,2}))?/.exec(t);
  const m = /(\d+)\s*(?:min|minutos?)\b/.exec(t);
  if (h) minutes = Number(h[1]) * 60 + (h[2] ? (h[2] === "meia" ? 30 : Number(h[2])) : 0);
  else if (/\bmeia hora\b/.test(t)) minutes = 30;
  else if (m) minutes = Number(m[1]);
  if (!minutes || minutes > 12 * 60) return null;
  return earlier && !later ? -minutes : minutes;
}

function addToTime(time: string, delta: number): string | null {
  const total = minutesOf(time) + delta;
  if (total < 0 || total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function extractPhoneRef(text: string): string | undefined {
  const m = /\b(?:final|terminad[oa] em|telefone|fone|celular|whatsapp|zap)\s*(?:e |do |de |numero |n[uú]mero )?([\d()\s.\-]{4,})/i.exec(text);
  const digits = m?.[1]?.replace(/\D/g, "");
  return digits && digits.length >= 4 ? digits : undefined;
}

function exampleFor(catalog: AgendaCatalog): string {
  const svc = catalog.services.find((s) => (s.durationMinutes ?? 0) > 0) ?? catalog.services[0];
  return `agenda ${svc ? svc.name.replace(/\s*\(.*\)\s*$/, "").toLowerCase() : "um serviço"} pro João amanhã às 14h`;
}

/** Perguntas que se respondem só com o catálogo: preço, duração, quem faz, lista de serviços/profissionais. */
function answerCatalogQuestion(t: string, text: string, catalog: AgendaCatalog): string | null {
  const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
  const svc = matchServices(withoutExtras(text), catalog.services)[0];
  const activePros = catalog.professionals.filter((p) => p.active);
  if (/\b(quais|lista\w*|meus|mostr\w+|ver)\b.*\bservicos?\b|\bquais servicos\b|\bque servicos\b/.test(t)) {
    if (catalog.services.length === 0) return "Sua empresa ainda não tem serviço ativo cadastrado. Cadastre em Serviços.";
    return `Seus serviços ativos:\n${catalog.services.slice(0, 15).map((s) => `• ${s.name} — ${brl(s.price)}${s.durationMinutes ? `, ${formatDuration(s.durationMinutes)}` : ""}`).join("\n")}`;
  }
  if (/\b(quais|lista\w*|meus|mostr\w+|ver|quem sao)\b.*\b(profissionais|funcionarios|equipe|atendentes)\b|\bquem (trabalha|atende) (aqui|hoje)\b/.test(t)) {
    return activePros.length ? `Profissionais ativos:\n${activePros.map((p) => `• ${p.name}`).join("\n")}` : "Nenhum profissional ativo. Cadastre em Equipe.";
  }
  if (svc && /\b(quanto (custa|e|eh|sai|cobra\w*)|qual (e )?(o )?(preco|valor)|preco|valor)\b/.test(t)) {
    const extra = activePros.filter((p) => p.serviceIds.includes(svc.id) && p.overrides?.[svc.id]?.price != null && p.overrides[svc.id]!.price !== svc.price);
    return `${svc.name}: ${brl(svc.price)}${svc.durationMinutes ? ` (${formatDuration(svc.durationMinutes)})` : ""}.${extra.length ? ` Com ${extra.map((p) => `${p.name}: ${brl(p.overrides![svc.id]!.price!)}`).join("; ")}.` : ""}`;
  }
  if (svc && /\b(quanto tempo|qual (e )?a duracao|duracao|demora|dura)\b/.test(t)) {
    return `${svc.name} dura ${svc.durationMinutes ? formatDuration(svc.durationMinutes) : "um tempo que ainda não foi cadastrado"}.`;
  }
  if (svc && /\bquem (faz|atende|realiza|trabalha com)\b/.test(t)) {
    const who = eligibleProfessionals(catalog, svc.id);
    return who.length ? `${svc.name} é feito por: ${who.map((p) => p.name).join(", ")}.` : `Ninguém ativo faz ${svc.name} ainda. Ajuste em Equipe.`;
  }
  return null;
}

/** Assuntos que não são "agendar": consulta, ajuda, conversa e coisas que ainda se fazem nas telas. Null = é um agendamento. */
async function routeOutsideAgendar(text: string, catalog: AgendaCatalog, clock: ChatClock, ports: AgendarPorts): Promise<string[] | null> {
  const t = norm(text).replace(/[.!?]+$/g, "").trim();
  const words = t.split(" ").filter(Boolean);
  const strict = detectAgendar(text);
  const example = exampleFor(catalog);

  if (/\b(cancel\w*|desmarc\w*|reagend\w*|remarc\w*|apag\w*|exclu\w*|delet\w*|remov\w*)\b/.test(t) && !/\b(agendar|marcar|reservar)\b/.test(t)) {
    return ["Ainda não cancelo nem reagendo por aqui. Abra a Agenda, toque no agendamento e use Cancelar ou Reagendar. Por aqui eu agendo novos serviços."];
  }
  const asksSlots = /^(tem|ha|existe|sobrou|sobra|tem algum|ha algum)\s+(algum |alguma )?(horario|vaga)\b/.test(t) || (/\b(horarios?|vaga|vagas)\b/.test(t) && /\b(livre|livres|disponivel|disponiveis|vago|vagos)\b|\bquais horarios\b/.test(t)) || /\b(tem|ha) (horario|vaga)\b.*\?/.test(text.toLowerCase());
  if (!strict || /^(tem|ha|existe)\b/.test(t)) {
    if (asksSlots) return [await consultFree(text, catalog, clock, ports)];
  }
  if (!strict && (/\b(o que|que|quais|quantos|quanto)\b.*\b(agendamentos?|agenda|compromissos?|atendimentos?|clientes)\b/.test(t) || /\b(minha agenda|agenda d[eo] (hoje|amanha))\b/.test(t) || /\b(o que|que) (eu )?(tenho|temos)\b/.test(t))) return [await consultDay(text, clock, ports)];
  if (!strict) {
    const answer = answerCatalogQuestion(t, text, catalog);
    if (answer) return [answer];
  }
  if (!strict && /\b(cadastr\w+|novo cliente|incluir cliente)\b/.test(t) && /\bcliente\b/.test(t)) return ["Cadastrar cliente por aqui ainda não dá. Use o menu Clientes. Se o cliente for novo num agendamento, eu pergunto se quer cadastrar na hora."];
  if (!strict && /\b(produto|produtos|estoque|vender|venda|vendas|caixa|financeiro|faturamento|fatura|relatorio|relatorios|compra|compras|fornecedor|folha|funcionario)\b/.test(t)) {
    return ["Esse assunto eu ainda não faço por aqui. Use o menu do lado (Vendas, Caixa, Estoque, Financeiro…). Por enquanto eu só agendo serviços."];
  }
  if (!strict && /^(oi|ola|opa|e ai|ei|hey|bom dia|boa tarde|boa noite|tudo bem)\b/.test(t) && words.length <= 4) return [`Oi! Sou a Cláudia. Posso agendar serviços, mostrar horários livres e a agenda do dia. Por exemplo: "${example}".`];
  if (!strict && /\b(obrigad[oa]|valeu|brigad[oa]|thanks|vlw)\b/.test(t) && words.length <= 5) return ["De nada! Quando precisar, é só pedir."];
  if (!strict && /\b(ajuda|help|comandos?)\b|\b(o que|oque) (voce|vc|tu) (faz|sabe|pode)\b|\bcomo (funciona|usar|uso)\b/.test(t)) {
    return [`Eu faço assim: você diz o que quer e eu pergunto só o que faltar. Exemplos:\n• "${example}"\n• "quais horários livres amanhã?"\n• "o que eu tenho hoje?"\nNada é gravado sem o seu Confirmar. Por enquanto só agendo (não cancelo nem reagendo).`];
  }
  // "polimento Beatriz amanhã às 10h": serviço conhecido + data/hora, mesmo sem o verbo
  const w = parseDateTimePt(text, clock);
  const hasWhen = !!(w.date || w.time);
  // serviço conhecido ("polimento Beatriz amanhã 10h") ou cliente conhecido ("João Pedro amanhã às 10h") + data/hora
  const implicit = hasWhen && (matchServices(text, catalog.services).length > 0 || ((await ports.findCustomersInText?.(text))?.length ?? 0) > 0);
  if (strict || implicit) return null;
  return [`Por enquanto eu consigo agendar serviços. Tente: "${example}".`];
}

async function consultFree(text: string, catalog: AgendaCatalog, clock: ChatClock, ports: AgendarPorts): Promise<string> {
  const when = parseDateTimePt(text, clock);
  const date = when.date?.value ?? clock.today;
  const service = matchServices(text, catalog.services)[0];
  const duration = service?.durationMinutes && service.durationMinutes > 0 ? service.durationMinutes : 30;
  const named = [...matchProfessionals(text, catalog.professionals), ...looseProfessionals(text, catalog.professionals)].filter((p, i, a) => p.active && a.indexOf(p) === i);
  const pros = (named.length ? named : eligibleProfessionals(catalog, service?.id)).slice(0, 5);
  if (pros.length === 0) return "Não achei nenhum profissional ativo para essa consulta. Confira em Equipe.";
  const lines: string[] = [];
  for (const p of pros) {
    const schedule = await ports.loadSchedule(p.id, date);
    if (!schedule) { lines.push(`• ${p.name}: não consegui ler a agenda agora`); continue; }
    const free = suggestFreeStarts(date, service ? effectiveDuration({ servico: { id: service.id, name: service.name, durationMinutes: service.durationMinutes, price: service.price }, profissional: professionalSlot(p, service.id) }) ?? duration : duration, schedule, clock, 8);
    lines.push(`• ${p.name}: ${free.length ? free.join(", ") : "sem horário livre"}`);
  }
  return `Horários livres em ${formatDatePt(date)}${service ? ` para ${service.name}` : ` (${duration} min)`}:\n${lines.join("\n")}\nPara agendar, diga por exemplo: "${exampleFor(catalog)}".`;
}

async function consultDay(text: string, clock: ChatClock, ports: AgendarPorts): Promise<string> {
  const when = parseDateTimePt(text, clock);
  const date = when.date?.value ?? clock.today;
  if (!ports.loadDayAppointments) return `Para ver a agenda de ${formatDatePt(date)}, abra o menu Agenda.`;
  const list = (await ports.loadDayAppointments(date)).filter((a) => !/cancel|no_show/.test(a.status));
  if (list.length === 0) return `Sem agendamentos em ${formatDatePt(date)}.`;
  const shown = list.slice(0, 15).map((a) => `• ${a.start}–${a.end} ${a.customer} · ${a.service} (${a.professional})`);
  return `Agenda de ${formatDatePt(date)} (${list.length} agendamento${list.length > 1 ? "s" : ""}):\n${shown.join("\n")}${list.length > 15 ? `\n… e mais ${list.length - 15}. Veja todos no menu Agenda.` : ""}`;
}

export async function runAgendarTurn(input: TurnInput, ports: AgendarPorts): Promise<TurnResult> {
  const { catalog, clock } = input;
  const state: AgendarState = { ...input.state, slots: { ...input.state.slots } };
  let skipCustomer = false;
  const messages: ChatMessage[] = [];
  const text = input.text ?? "";
  const t0 = norm(text).replace(/[.!?]+$/g, "").trim();
  const proBefore = state.slots.profissional?.id;
  const offered = state.lastOptions;
  delete state.lastOptions;

  if (CANCEL_WORDS.test(norm(text)) && state.started) {
    return { state: emptyState(), messages: [{ kind: "notice", text: "Combinado, descartei esse agendamento. Quando quiser, é só pedir de novo." }], status: "coletando", missing: [], blocks: [], warnings: [] };
  }
  if (state.started && /^(recomecar|comecar de novo|comecar do zero|do zero|limpar tudo|zerar|novo agendamento)\b/.test(t0)) {
    return { state: emptyState(), messages: [{ kind: "notice", text: "Recomecei do zero. O que você quer agendar?" }], status: "coletando", missing: [], blocks: [], warnings: [] };
  }

  // 1) escolha pendente (clique ou resposta curta)
  if (state.pending) {
    const options = state.pending.options;
    const offerNew = state.pending.field === "cliente" ? options.find((o) => o.id.startsWith(NEW_PREFIX)) : undefined;
    const no = offerNew && /^(nao|n|nao quero|outro|outro nome|errado|nao e)$/.test(t0);
    const yes = offerNew && /^(sim|s|pode|pode sim|quero|isso|cadastra|cadastrar|ok|claro|certo)$/.test(t0);
    const picked = no ? options.find((o) => o.id === OTHER_NAME)! : yes ? offerNew! : input.choice && input.choice.field === state.pending.field ? options.find((o) => o.id === input.choice!.id) ?? null : pickOption(text, options);
    if (picked) {
      applyChoice(state, state.pending.field, picked, catalog);
      if (picked.id === OTHER_NAME) {
        state.asked = ["cliente"];
        skipCustomer = true; // "2" era o botão, não o nome
      }
      state.pending = null;
    } else if (offerNew) {
      // não respondeu à oferta: trata o texto como outro nome de cliente
      state.pending = null;
      state.asked = [...state.asked, "cliente"];
    } else {
      return {
        state,
        messages: [{ kind: "disambiguate", text: "Não consegui saber qual. Escolha uma das opções (pode digitar o número).", field: state.pending.field, options }],
        status: "coletando",
        missing: missingFields(state.slots),
        blocks: [],
        warnings: [],
      };
    }
  } else if (!state.started) {
    const routed = await routeOutsideAgendar(text, catalog, clock, ports);
    if (routed) {
      return { state, messages: routed.map((t) => ({ kind: "notice" as const, text: t })), status: "coletando", missing: [], blocks: [], warnings: [] };
    }
    state.started = true;
  }

  // horário escolhido entre os que a Cláudia ofereceu ("o 2", "o primeiro livre")
  if (offered?.length && !state.pending) {
    const pick = pickOffered(text, offered);
    if (pick) {
      state.slots.time = pick.id;
      skipCustomer = true;
    }
  }

  // 2) entender a frase (primeira ordem ou resposta)
  const u = understandAgendar(text, catalog, clock);
  const asked = state.asked;
  const answering = (f: AgendarField) => asked.includes(f);
  const bare = /^(agendar|agenda|agende|marcar|marca|marque|reservar)$/.test(t0);

  // pedidos de edição sem o valor novo ("outro horário", "mudar o cliente"): limpa o campo e pergunta de novo
  const edit = state.started ? /\b(outro|outra|trocar|mudar|alterar|corrigir)\s+(?:o |a |de |do |da )?(cliente|servico|profissional|horario|hora|dia|data)\b/.exec(t0) : null;
  if (edit) {
    const what = edit[2]!;
    if (what === "cliente") {
      delete state.slots.cliente;
      state.asked = ["cliente"];
      if (t0.split(" ").length <= 3) skipCustomer = true; // só "outro cliente": o nome vem na próxima mensagem
    }
    else if (what === "servico") { delete state.slots.servico; delete state.slots.profissional; state.asked = ["servico"]; }
    else if (what === "profissional") { delete state.slots.profissional; state.anyPro = false; state.asked = ["profissional"]; }
    else if (what === "horario" || what === "hora") { delete state.slots.time; delete state.slots.endTime; state.asked = ["inicio"]; }
    else { delete state.slots.date; state.asked = ["inicio"]; }
  }
  const asked2 = state.asked;
  const answering2 = (f: AgendarField) => asked2.includes(f) || answering(f);

  if (/\b(voltar|desfazer|volta)\b/.test(t0) && t0.split(" ").length <= 3 && state.started) {
    messages.push({ kind: "notice", text: 'O que você quer mudar? Diga, por exemplo, "outro horário", "mudar o cliente" ou "cancelar".' });
  }

  if (!state.slots.servico) {
    let found = u.services.length ? u.services : answering2("servico") ? matchServices(text, catalog.services) : [];
    const many = mentionedServices(text, catalog.services);
    if (many.length >= 2) {
      found = [many[0]!];
      messages.push({ kind: "notice", text: `Eu agendo um serviço por vez: começo por ${many[0]!.name}. Depois é só pedir ${many.slice(1).map((s) => s.name).join(" e ")}.` });
    }
    const askedService = extractServiceText(text);
    if (found.length === 0 && catalog.services.length > 0 && !bare && (answering2("servico") || askedService || /\bservico\b/.test(norm(text)))) {
      const shown = askedService ?? (answering2("servico") ? norm(text).slice(0, 40) : undefined);
      messages.push({
        kind: "notice",
        text: `Não encontrei ${shown ? `o serviço "${shown}"` : "esse serviço"} entre os seus serviços ativos. Escolha um da lista ou cadastre o serviço em Serviços.`,
      });
    }
    if (found.length === 1) state.slots.servico = { id: found[0]!.id, name: found[0]!.name, durationMinutes: found[0]!.durationMinutes, price: found[0]!.price };
    else if (found.length > 1) {
      state.pending = { field: "servico", options: found.map((s) => ({ id: s.id, label: s.name, detail: s.durationMinutes ? formatDuration(s.durationMinutes) : "sem duração" })) };
    }
  }

  // mudança de ideia: citou outro serviço que existe (e o rascunho já tinha um)
  else if (state.slots.servico && !state.pending && u.services.length === 1 && u.services[0]!.id !== state.slots.servico.id && !answering2("servico")) {
    const s = u.services[0]!;
    state.slots.servico = { id: s.id, name: s.name, durationMinutes: s.durationMinutes, price: s.price };
  }

  if (ANY_PRO.test(t0)) state.anyPro = true;

  const pendingNow = state.pending;
  if (!state.slots.profissional && pendingNow?.field === "servico" && u.professionals.length === 1) {
    // a escolha do serviço continua pendente, mas o profissional já dito não se perde
    state.slots.profissional = professionalSlot(u.professionals[0]!, undefined);
  }
  if (!state.slots.profissional && !state.pending) {
    let found = u.professionals;
    if (found.length === 0 && !state.anyPro) {
      // citado sem gatilho ("Ana Paula, corte…", "se a Ana puder"): só entre os que fazem o serviço
      const eligible = eligibleProfessionals(catalog, state.slots.servico?.id);
      found = looseProfessionals(text, eligible, u.customerText);
    }
    if (found.length === 0 && answering2("profissional")) {
      const eligible = eligibleProfessionals(catalog, state.slots.servico?.id);
      const byNumber = /^\s*(?:opcao |numero )?\d{1,2}\s*$/.test(norm(text)) ? pickOption(text, eligible.map((p) => ({ id: p.id, label: p.name }))) : null;
      found = byNumber ? eligible.filter((p) => p.id === byNumber.id) : eligible.filter((p) => pickOption(text, [{ id: p.id, label: p.name }]));
    }
    if (found.length === 1) state.slots.profissional = professionalSlot(found[0]!, state.slots.servico?.id);
    else if (found.length > 1) state.pending = { field: "profissional", options: found.map((p) => ({ id: p.id, label: p.name })) };
    else if (!answering2("profissional") && !state.anyPro) {
      const unknown = unknownProfessionalRef(text, catalog.professionals);
      if (unknown) messages.push({ kind: "notice", text: `Não encontrei nenhum profissional chamado "${unknown}".` });
    }
  } else if (state.slots.profissional && state.slots.servico) {
    // mudança de ideia: citou outro profissional depois de já ter um
    const explicit = u.professionals.length === 1 && u.professionals[0]!.id !== state.slots.profissional.id ? u.professionals[0]! : null;
    const pro = explicit ?? catalog.professionals.find((p) => p.id === state.slots.profissional!.id);
    if (pro) state.slots.profissional = professionalSlot(pro, state.slots.servico.id);
  }

  if (!state.slots.cliente && (!state.pending || (state.pending.field === "servico" && !!u.customerText)) && !skipCustomer) {
    const keepPending = state.pending;
    const typed = answering2("cliente") ? norm(text).replace(/^(?:e |eh |o |a |pro |pra |para |cliente )+/, "").trim() || undefined : undefined;
    // resposta solta ("3", "não sei", frase longa) não é nome: não procura nem oferece cadastro
    const customerText = u.customerText ?? (typed && plausibleName(typed) ? typed : undefined);
    const phone = extractPhoneRef(text);
    if (!u.customerText && typed && !customerText && !phone) {
      messages.push({ kind: "notice", text: "Não entendi esse nome de cliente. Escreva só o nome (por exemplo: Maria Souza)." });
      state.asked = [...state.asked, "cliente"];
    } else if (customerText || phone) {
      let found: Candidate[] = customerText ? await ports.findCustomers(customerText) : [];
      if (phone && ports.findCustomersByPhone) {
        const byPhone = await ports.findCustomersByPhone(phone);
        if (customerText && found.length > 1) found = found.filter((c) => byPhone.some((b) => b.id === c.id));
        else if (!customerText || found.length === 0) found = byPhone;
      }
      if (found.length === 1) state.slots.cliente = { id: found[0]!.id, name: found[0]!.name };
      else if (keepPending) {
        // já há uma escolha de serviço pendente: o cliente é resolvido na próxima volta
      } else if (found.length > 1) state.pending = { field: "cliente", options: asOptions(found) };
      else if (!customerText) {
        messages.push({ kind: "notice", text: "Não achei nenhum cliente com esse telefone. Diga o nome do cliente." });
        state.asked = [...state.asked, "cliente"];
      } else if (ports.findInactiveCustomers && (await ports.findInactiveCustomers(customerText)).length > 0) {
        const inactive = (await ports.findInactiveCustomers(customerText))[0]!;
        messages.push({ kind: "notice", text: `O cliente "${inactive.name}" está inativo. Reative em Clientes ou escreva outro nome.` });
        state.asked = [...state.asked, "cliente"];
      } else {
        // não existe: oferece cadastrar (só é criado quando a pessoa confirmar o agendamento)
        const shown = originalCustomerName(text, customerText);
        if (!plausibleName(shown)) {
          messages.push({ kind: "notice", text: "Não entendi esse nome de cliente. Escreva só o nome (por exemplo: Maria Souza)." });
          state.asked = [...state.asked, "cliente"];
        } else state.pending = {
          field: "cliente",
          options: [
            { id: `${NEW_PREFIX}${shown}`, label: `Cadastrar "${shown}" como cliente novo` },
            { id: OTHER_NAME, label: "Escrever outro nome" },
          ],
        };
      }
    } else if (!state.pending && ports.findCustomersInText) {
      // nenhum "para/pro": procura no texto o nome de alguém que já é cliente ("corte do joão paulo amanhã 15h")
      const inText = await ports.findCustomersInText(text);
      if (inText.length === 1) state.slots.cliente = { id: inText[0]!.id, name: inText[0]!.name };
      else if (inText.length > 1) state.pending = { field: "cliente", options: asOptions(inText) };
    }
  }

  // mudança de ideia depois do resumo: "na verdade é para o Marcos" (só troca quando acha UM cliente diferente)
  else if (state.slots.cliente && u.customerText && !state.pending && !skipCustomer && state.started) {
    const others = await ports.findCustomers(u.customerText);
    if (others.length === 1 && others[0]!.id !== state.slots.cliente.id) state.slots.cliente = { id: others[0]!.id, name: others[0]!.name };
  }

  // data e hora (só preenche o que falta; mudança de ideia depois do cartão vem em turnos seguintes)
  let when = parseDateTimePt(text, clock);
  // "adiar uma hora" / "meia hora mais cedo" são ajustes, não um horário novo
  if (state.slots.time && parseShift(t0) !== null && !/\b(?:as|para|pra)\s+\d/.test(t0)) when = { problems: [] };
  if (when.problems.length) messages.push({ kind: "error", text: when.problems[0]! });
  // valores sem dúvida entram mesmo com outra escolha pendente; os ambíguos só viram pergunta se não houver outra pendente
  if (when.date) {
    if (!when.date.candidates) state.slots.date = when.date.value;
    else if (!state.pending) state.pending = { field: "data", options: when.date.candidates.map((d) => ({ id: d, label: formatDatePt(d) })) };
  }
  if (when.time) {
    if (!when.time.candidates) state.slots.time = when.time.value;
    else if (!state.pending) state.pending = { field: "hora", options: when.time.candidates.map((t) => ({ id: t, label: t })) };
  }
  if (when.endTime) state.slots.endTime = when.endTime;
  if (when.dayPart && !state.slots.time) state.slots.dayPart = when.dayPart;
  if (state.slots.time) delete state.slots.dayPart;

  // adiar / antecipar ("adiar uma hora", "30 minutos mais cedo")
  if (!when.time && state.slots.time) {
    const shift = parseShift(t0);
    if (shift) {
      const moved = addToTime(state.slots.time, shift);
      if (moved) {
        state.slots.time = moved;
        delete state.slots.endTime;
      } else messages.push({ kind: "error", text: "Esse ajuste passaria para outro dia. Diga o novo dia e horário." });
    }
  }

  // "com a Ana então" / "no mesmo horário": reaproveita o horário que deu conflito
  const proChanged = !!state.slots.profissional && state.slots.profissional.id !== proBefore && !!proBefore;
  if (state.previous?.time && !state.slots.time && !when.time && (proChanged || /\bmesmo horario\b/.test(t0))) {
    state.slots.time = state.previous.time;
    if (state.previous.endTime) state.slots.endTime = state.previous.endTime;
    if (!state.slots.date && state.previous.date) state.slots.date = state.previous.date;
    delete state.slots.dayPart;
  }

  // valor, duração e observação ditos junto do pedido
  const extras = parseExtras(text);
  if (extras.priceOverride !== undefined) state.slots.priceOverride = extras.priceOverride;
  if (extras.durationMinutes && !state.slots.endTime) state.slots.durationMinutes = extras.durationMinutes;
  if (extras.notes) state.slots.notes = extras.notes;
  if (extras.discountPct !== undefined && state.slots.servico) {
    const base = state.slots.profissional?.priceOverride ?? state.slots.servico.price;
    state.slots.priceOverride = Math.round(base * (1 - extras.discountPct / 100) * 100) / 100;
  }
  if (extras.unsupported.includes("recorrencia")) messages.push({ kind: "notice", text: "Ainda não faço agendamentos que se repetem. Eu agendo este e você me pede os próximos." });
  if (extras.unsupported.includes("duplicar")) messages.push({ kind: "notice", text: "Eu agendo um de cada vez. Termine este e peça o outro." });
  if (extras.unsupported.includes("desconto-sem-valor")) messages.push({ kind: "notice", text: 'Diga o valor final ou a porcentagem do desconto. Exemplo: "valor 80" ou "10% de desconto".' });

  // único profissional possível: sugere e segue (aparece no cartão)
  if (!state.slots.profissional && state.slots.servico && !state.pending) {
    const only = eligibleProfessionals(catalog, state.slots.servico.id);
    if (only.length === 1) {
      state.slots.profissional = professionalSlot(only[0]!, state.slots.servico.id);
      messages.push({ kind: "notice", text: `${only[0]!.name} é o único profissional que faz ${state.slots.servico.name}.` });
    }
  }
  // "sim" digitado diante do resumo: nada é gravado por texto; lembra do botão
  if (!state.pending && missingFields(state.slots).length === 0 && AFFIRMATIVE.test(t0)) {
    messages.push({ kind: "notice", text: "Para gravar, toque em Confirmar no resumo. Por texto eu não gravo nada." });
  }
  return finishTurn(state, messages, ports, catalog, clock);
}

function applyChoice(state: AgendarState, field: PendingField, option: { id: string; label: string }, catalog: AgendaCatalog) {
  if (field === "cliente") {
    if (option.id.startsWith(NEW_PREFIX)) state.slots.cliente = { id: "", name: option.id.slice(NEW_PREFIX.length), isNew: true };
    else if (option.id !== OTHER_NAME) state.slots.cliente = { id: option.id, name: option.label };
  }
  else if (field === "servico") {
    const s = catalog.services.find((x) => x.id === option.id);
    if (s) state.slots.servico = { id: s.id, name: s.name, durationMinutes: s.durationMinutes, price: s.price };
  } else if (field === "profissional") {
    const p = catalog.professionals.find((x) => x.id === option.id);
    if (p) state.slots.profissional = professionalSlot(p, state.slots.servico?.id);
  } else if (field === "data") state.slots.date = option.id;
  else if (field === "hora") state.slots.time = option.id;
}

const DAYPART_RANGE: Record<string, [number, number]> = { manha: [0, 12 * 60], tarde: [12 * 60, 18 * 60], noite: [18 * 60, 24 * 60] };

/** Profissionais que fazem o serviço e estão livres no dia/horário já combinados. */
async function freeProfessionalsAt(state: AgendarState, ports: AgendarPorts, catalog: AgendaCatalog, clock: ChatClock): Promise<{ free: CatalogProfessional[]; starts: string[]; closed: boolean }> {
  const slots = state.slots;
  const free: CatalogProfessional[] = [];
  const starts = new Set<string>();
  if (!slots.servico || !slots.date) return { free, starts: [], closed: false };
  let closedCount = 0;
  const pros = eligibleProfessionals(catalog, slots.servico.id);
  const weekday = weekdayOf(slots.date);
  for (const p of pros) {
    const schedule = await ports.loadSchedule(p.id, slots.date);
    if (schedule && schedule.availability.length > 0 && !schedule.availability.some((r) => r.weekday === weekday)) closedCount += 1;
    const candidate = { ...slots, profissional: professionalSlot(p, slots.servico.id) };
    if (slots.time && validateAgendar(candidate, { clock, catalog, schedule }).blocks.length === 0) free.push(p);
    const duration = effectiveDuration(candidate);
    if (schedule && duration) for (const t of suggestFreeStarts(slots.date, duration, schedule, clock, 12)) starts.add(t);
  }
  return { free, starts: [...starts].sort(), closed: pros.length > 0 && closedCount === pros.length };
}

async function finishTurn(state: AgendarState, messages: ChatMessage[], ports: AgendarPorts, catalog: AgendaCatalog, clock: ChatClock): Promise<TurnResult> {
  if (state.pending) {
    const labels: Record<PendingField, string> = {
      cliente: state.pending.options.some((o) => o.id.startsWith(NEW_PREFIX)) ? "Não encontrei esse cliente no cadastro. Quer cadastrar como cliente novo?" : "Encontrei mais de um cliente. Qual deles?",
      servico: "Qual destes serviços?",
      profissional: "Qual profissional?",
      data: "Qual dia você quer?",
      hora: "Manhã ou tarde?",
    };
    messages.push({ kind: "disambiguate", text: labels[state.pending.field], field: state.pending.field, options: state.pending.options });
    return { state, messages, status: "coletando", missing: missingFields(state.slots), blocks: [], warnings: [] };
  }

  // profissional ainda não escolhido, mas serviço/dia/horário já definidos: só entram os que estão LIVRES nesse horário
  if (!state.slots.profissional && state.slots.servico && state.slots.date && state.slots.time) {
    const { free, starts, closed } = await freeProfessionalsAt(state, ports, catalog, clock);
    if (free.length === 1 || (free.length > 1 && state.anyPro)) {
      state.slots.profissional = professionalSlot(free[0]!, state.slots.servico.id);
      messages.push({ kind: "notice", text: free.length === 1 ? `${free[0]!.name} é o único livre às ${state.slots.time}.` : `Escolhi ${free[0]!.name}, o primeiro livre às ${state.slots.time}.` });
    } else if (free.length > 1) {
      state.asked = ["profissional"];
      messages.push({ kind: "ask", text: `Quem vai fazer? Livres às ${state.slots.time}: ${free.map((p) => p.name).join(", ")}.`, options: free.map((p) => ({ id: p.id, label: p.name })), fields: ["profissional"] });
      return { state, messages, status: "coletando", missing: ["profissional"], blocks: [], warnings: [] };
    } else if (closed) {
      // ninguém atende nesse dia da semana: o problema é o DIA, não o horário
      state.previous = { date: state.slots.date, time: state.slots.time, endTime: state.slots.endTime };
      messages.push({ kind: "error", text: `Ninguém atende em ${formatDatePt(state.slots.date)} (dia sem expediente). Qual outro dia prefere?` });
      delete state.slots.date;
      state.asked = ["inicio"];
      return { state, messages, status: "coletando", missing: ["inicio"], blocks: [], warnings: [] };
    } else if (eligibleProfessionals(catalog, state.slots.servico.id).length > 1) {
      state.previous = { date: state.slots.date, time: state.slots.time, endTime: state.slots.endTime };
      state.asked = ["inicio"];
      delete state.slots.time;
      delete state.slots.endTime;
      state.lastOptions = starts.slice(0, 6).map((t) => ({ id: t, label: t }));
      messages.push({ kind: "error", text: `Nenhum profissional está livre às ${state.previous.time} em ${formatDatePt(state.slots.date)}.` });
      messages.push({
        kind: "ask",
        text: starts.length ? `Horários com alguém livre: ${starts.slice(0, 6).join(", ")}. Qual prefere?` : "Qual outro dia ou horário prefere?",
        options: state.lastOptions,
        fields: ["inicio"],
      });
      return { state, messages, status: "coletando", missing: ["inicio"], blocks: [], warnings: [] };
    }
  }

  // só a faixa do dia ("de manhã", "à tarde", "cedo"): já mostra os horários livres dessa faixa
  if (state.slots.servico && state.slots.date && !state.slots.time && state.slots.dayPart && DAYPART_RANGE[state.slots.dayPart]) {
    const [from, to] = DAYPART_RANGE[state.slots.dayPart]!;
    let starts: string[] = [];
    if (state.slots.profissional) {
      const schedule = await ports.loadSchedule(state.slots.profissional.id, state.slots.date);
      const duration = effectiveDuration(state.slots);
      if (schedule && duration) starts = suggestFreeStarts(state.slots.date, duration, schedule, clock, 48);
    } else starts = (await freeProfessionalsAt(state, ports, catalog, clock)).starts;
    starts = starts.filter((t) => minutesOf(t) >= from && minutesOf(t) < to).slice(0, 6);
    if (starts.length === 0) {
      const label = state.slots.dayPart === "manha" ? "de manhã" : `à ${state.slots.dayPart}`;
      messages.push({ kind: "notice", text: `Não há horários livres ${label} em ${formatDatePt(state.slots.date)}.` });
    }
    if (starts.length) {
      state.asked = ["inicio"];
      state.lastOptions = starts.map((t) => ({ id: t, label: t }));
      const label = state.slots.dayPart === "manha" ? "de manhã" : `à ${state.slots.dayPart}`;
      messages.push({ kind: "ask", text: `Horários livres ${label} em ${formatDatePt(state.slots.date)}: ${starts.join(", ")}. Qual prefere?`, options: state.lastOptions, fields: state.slots.profissional ? ["inicio"] : ["inicio", "profissional"] });
      return { state, messages, status: "coletando", missing: missingFields(state.slots), blocks: [], warnings: [] };
    }
  }

  const missing = missingFields(state.slots);
  if (missing.length > 0) {
    const q = nextQuestion(state.slots, catalog);
    state.asked = q?.fields ?? [];
    if (q) messages.push({ kind: "ask", text: q.text, options: q.options, fields: q.fields });
    return { state, messages, status: "coletando", missing, blocks: [], warnings: [] };
  }

  const slots = state.slots;
  const schedule = slots.profissional && slots.date ? await ports.loadSchedule(slots.profissional.id, slots.date) : null;
  const validation = validateAgendar(slots, { clock, catalog, schedule });
  if (validation.blocks.length > 0) {
    // limpa o horário que não serve e oferece alternativas
    const duration = effectiveDuration(slots);
    const free = schedule && slots.date && duration ? suggestFreeStarts(slots.date, duration, schedule, clock, 5) : [];
    const hasTimeProblem = validation.blocks.some((b) => /ocupado|bloqueio|atende|término/.test(b));
    state.asked = hasTimeProblem ? ["inicio"] : [];
    if (hasTimeProblem) {
      state.previous = { date: slots.date, time: slots.time, endTime: slots.endTime };
      state.lastOptions = free.map((t) => ({ id: t, label: t }));
      delete state.slots.time;
      delete state.slots.endTime;
    }
    messages.push({ kind: "error", text: validation.blocks[0]! });
    if (hasTimeProblem) {
      messages.push({
        kind: "ask",
        text: free.length ? `Horários livres em ${formatDatePt(slots.date!)}: ${free.join(", ")}. Qual prefere?` : "Qual outro dia ou horário prefere?",
        options: free.map((t) => ({ id: t, label: t })),
        fields: ["inicio"],
      });
    }
    return { state, messages, status: "coletando", missing: hasTimeProblem ? ["inicio"] : [], blocks: validation.blocks, warnings: validation.warnings };
  }

  const card = summarizeAgendar(slots, validation);
  state.asked = [];
  delete state.previous;
  if (!card) return { state, messages: [...messages, { kind: "error", text: "Não consegui montar o resumo. Vamos tentar de novo?" }], status: "coletando", missing: [], blocks: [], warnings: [] };
  messages.push({ kind: "confirm", text: "Confere? Eu só agendo depois do seu Confirmar.", card });
  return { state, messages, status: "aguardando_confirmacao", missing: [], blocks: [], warnings: validation.warnings };
}

export { extractCustomerText };
