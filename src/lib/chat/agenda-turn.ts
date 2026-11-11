import { norm, tokens } from "./text.ts";
import { parseDateTimePt, formatDatePt, type ChatClock } from "./datetime-pt.ts";
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
  professionalSlot,
  suggestFreeStarts,
  summarizeAgendar,
  understandAgendar,
  validateAgendar,
  type AgendaCatalog,
  type AgendarField,
  type AgendarSlots,
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
}

export const emptyState = (): AgendarState => ({ slots: {}, asked: [], pending: null, started: false });

export interface AgendarPorts {
  /** clientes ativos da empresa cujo nome combina com o texto (no máximo ~5) */
  findCustomers(text: string): Promise<Candidate[]>;
  /** clientes INATIVOS que combinam com o texto (para avisar em vez de oferecer um cadastro duplicado) */
  findInactiveCustomers?(text: string): Promise<Candidate[]>;
  /** agenda do profissional no dia (expediente, bloqueios, ocupados); null se não houver como carregar */
  loadSchedule(professionalId: string, date: string): Promise<ProfessionalSchedule | null>;
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

export async function runAgendarTurn(input: TurnInput, ports: AgendarPorts): Promise<TurnResult> {
  const { catalog, clock } = input;
  const state: AgendarState = { ...input.state, slots: { ...input.state.slots } };
  let skipCustomer = false;
  const messages: ChatMessage[] = [];
  const text = input.text ?? "";

  if (CANCEL_WORDS.test(norm(text)) && state.started) {
    return { state: emptyState(), messages: [{ kind: "notice", text: "Combinado, descartei esse agendamento. Quando quiser, é só pedir de novo." }], status: "coletando", missing: [], blocks: [], warnings: [] };
  }

  // 1) escolha pendente (clique ou resposta curta)
  if (state.pending) {
    const options = state.pending.options;
    const offerNew = state.pending.field === "cliente" ? options.find((o) => o.id.startsWith(NEW_PREFIX)) : undefined;
    const no = offerNew && /^(nao|n|nao quero|outro|outro nome|errado|nao e)$/.test(norm(text).replace(/[.!?]+$/g, "").trim());
    const yes = offerNew && /^(sim|s|pode|pode sim|quero|isso|cadastra|cadastrar|ok|claro|certo)$/.test(norm(text).replace(/[.!?]+$/g, "").trim());
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
    // "polimento Beatriz amanhã às 10h": serviço conhecido + data/hora, mesmo sem o verbo
    const implicit = matchServices(text, catalog.services).length > 0 && (() => { const w = parseDateTimePt(text, clock); return !!(w.date || w.time); })();
    if (!detectAgendar(text) && !implicit) {
      return {
        state,
        messages: [{ kind: "notice", text: "Por enquanto eu consigo agendar serviços. Tente: \"agenda uma lavagem detalhada pro João amanhã às 14h com o Lúcio\"." }],
        status: "coletando",
        missing: [],
        blocks: [],
        warnings: [],
      };
    }
    state.started = true;
  }

  // 2) entender a frase (primeira ordem ou resposta)
  const u = understandAgendar(text, catalog, clock);
  const asked = state.asked;
  const answering = (f: AgendarField) => asked.includes(f);

  if (!state.slots.servico) {
    const found = u.services.length ? u.services : answering("servico") ? matchServices(text, catalog.services) : [];
    const askedService = extractServiceText(text);
    if (found.length === 0 && catalog.services.length > 0 && (answering("servico") || askedService || /\bservico\b/.test(norm(text)))) {
      const shown = askedService ?? (answering("servico") ? norm(text).slice(0, 40) : undefined);
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
  else if (state.slots.servico && !state.pending && u.services.length === 1 && u.services[0]!.id !== state.slots.servico.id && !answering("servico")) {
    const s = u.services[0]!;
    state.slots.servico = { id: s.id, name: s.name, durationMinutes: s.durationMinutes, price: s.price };
  }

  const pendingNow = state.pending;
  if (!state.slots.profissional && pendingNow?.field === "servico" && u.professionals.length === 1) {
    // a escolha do serviço continua pendente, mas o profissional já dito não se perde
    state.slots.profissional = professionalSlot(u.professionals[0]!, undefined);
  }
  if (!state.slots.profissional && !state.pending) {
    let found = u.professionals;
    if (found.length === 0 && answering("profissional")) {
      const eligible = eligibleProfessionals(catalog, state.slots.servico?.id);
      const byNumber = /^\s*(?:opcao |numero )?\d{1,2}\s*$/.test(norm(text)) ? pickOption(text, eligible.map((p) => ({ id: p.id, label: p.name }))) : null;
      found = byNumber ? eligible.filter((p) => p.id === byNumber.id) : eligible.filter((p) => pickOption(text, [{ id: p.id, label: p.name }]));
    }
    if (found.length === 1) state.slots.profissional = professionalSlot(found[0]!, state.slots.servico?.id);
    else if (found.length > 1) state.pending = { field: "profissional", options: found.map((p) => ({ id: p.id, label: p.name })) };
    else if (!answering("profissional")) {
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
    const typed = answering("cliente") ? norm(text).replace(/^(?:e |eh |o |a |pro |pra |para |cliente )+/, "").trim() || undefined : undefined;
    // resposta solta ("3", "não sei", frase longa) não é nome: não procura nem oferece cadastro
    const customerText = u.customerText ?? (typed && plausibleName(typed) ? typed : undefined);
    if (!u.customerText && typed && !customerText) {
      messages.push({ kind: "notice", text: "Não entendi esse nome de cliente. Escreva só o nome (por exemplo: Maria Souza)." });
      state.asked = [...state.asked, "cliente"];
    } else if (customerText) {
      const found = await ports.findCustomers(customerText);
      if (found.length === 1) state.slots.cliente = { id: found[0]!.id, name: found[0]!.name };
      else if (keepPending) {
        // já há uma escolha de serviço pendente: o cliente é resolvido na próxima volta
      } else if (found.length > 1) state.pending = { field: "cliente", options: asOptions(found) };
      else if (ports.findInactiveCustomers && (await ports.findInactiveCustomers(customerText)).length > 0) {
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
    }
  }

  // mudança de ideia depois do resumo: "na verdade é para o Marcos" (só troca quando acha UM cliente diferente)
  else if (state.slots.cliente && u.customerText && !state.pending && !skipCustomer && state.started) {
    const others = await ports.findCustomers(u.customerText);
    if (others.length === 1 && others[0]!.id !== state.slots.cliente.id) state.slots.cliente = { id: others[0]!.id, name: others[0]!.name };
  }

  // data e hora (só preenche o que falta; mudança de ideia depois do cartão vem em turnos seguintes)
  const when = parseDateTimePt(text, clock);
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

  // único profissional possível: sugere e segue (aparece no cartão)
  if (!state.slots.profissional && state.slots.servico && !state.pending) {
    const only = eligibleProfessionals(catalog, state.slots.servico.id);
    if (only.length === 1) {
      state.slots.profissional = professionalSlot(only[0]!, state.slots.servico.id);
      messages.push({ kind: "notice", text: `${only[0]!.name} é o único profissional que faz ${state.slots.servico.name}.` });
    }
  }
  // "sim" digitado diante do resumo: nada é gravado por texto; lembra do botão
  if (!state.pending && missingFields(state.slots).length === 0 && /^(sim|confirmo|confirmar|confirma|pode|pode confirmar|ok|isso|fechado|certo)$/.test(norm(text).replace(/[.!?]+$/g, "").trim())) {
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
  if (!card) return { state, messages: [...messages, { kind: "error", text: "Não consegui montar o resumo. Vamos tentar de novo?" }], status: "coletando", missing: [], blocks: [], warnings: [] };
  messages.push({ kind: "confirm", text: "Confere? Eu só agendo depois do seu Confirmar.", card });
  return { state, messages, status: "aguardando_confirmacao", missing: [], blocks: [], warnings: validation.warnings };
}

export { extractCustomerText };
