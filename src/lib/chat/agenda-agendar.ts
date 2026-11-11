import { fuzzyEq, nameCoverage, norm, tokenMatches, tokens } from "./text.ts";
import { spokenNumbersToDigits } from "./numbers-pt.ts";
import {
  addMinutesToLocal,
  formatDatePt,
  minutesOf,
  parseDateTimePt,
  weekdayOf,
  WEEKDAY_NAMES,
  type ChatClock,
  type ParsedDateTime,
} from "./datetime-pt.ts";

/**
 * Chat AI — subagente `agenda`, intenção `agenda.agendar` (R1). Ficha em docs/chat-ai/02 §2.1.1.
 * Tudo aqui é puro: recebe o catálogo e a agenda do profissional como dados e devolve o que entendeu, o que falta,
 * problemas, avisos e o cartão. O banco continua sendo a autoridade: a gravação revalida tudo (create_appointment).
 */

export interface CatalogService {
  id: string;
  name: string;
  /** minutos; null/0 = serviço sem duração (não dá para agendar) */
  durationMinutes: number | null;
  price: number;
}

export interface CatalogProfessional {
  id: string;
  name: string;
  active: boolean;
  /** serviços que o profissional atende */
  serviceIds: string[];
  /** duração/valor próprios do profissional para um serviço (professional_services); o banco usa antes do padrão do serviço */
  overrides?: Record<string, { durationMinutes?: number | null; price?: number | null }>;
}

export interface AgendaCatalog {
  services: CatalogService[];
  professionals: CatalogProfessional[];
}

export interface AvailabilityRule {
  weekday: number;
  start: string;
  end: string;
}

/** data-hora local "YYYY-MM-DDTHH:mm" (comparável como texto) */
export type LocalDateTime = string;

export interface ProfessionalSchedule {
  /** vazio = sem expediente cadastrado (nada a conferir além de bloqueios e conflitos) */
  availability: AvailabilityRule[];
  blocks: { start: LocalDateTime; end: LocalDateTime; reason?: string }[];
  busy: { start: LocalDateTime; end: LocalDateTime; label?: string }[];
}

export interface Candidate {
  id: string;
  name: string;
  detail?: string;
}

// ---------------------------------------------------------------------------------------------------- entendimento
export interface AgendarUnderstanding {
  isAgendar: boolean;
  services: CatalogService[];
  professionals: CatalogProfessional[];
  /** texto do nome do cliente como a pessoa disse (para o resolvedor de cadastros) */
  customerText?: string;
  when: ParsedDateTime;
}

/** A frase parece um pedido de agendamento? */
export function detectAgendar(text: string): boolean {
  return detectAgendarVerb(text);
}

const AGENDAR_VERBS = ["agendar", "agende", "agendo", "marcar", "marque", "reservar", "reserve", "agenda"];

function detectAgendarVerb(text: string): boolean {
  const t0 = norm(text);
  // erro de digitação no verbo ("agendr", "agnedar", "marca"): palavra a até 2 letras do verbo, sem confundir com "agendamento"
  const typo = t0.split(/[^a-z]+/).some((w) => w.length >= 5 && w !== "agendamento" && AGENDAR_VERBS.some((v) => w !== v && fuzzyEq(w, v))) || /\bagend\b/.test(t0);
  if (typo && !/\b(cancel\w*|apag\w*|exclu\w*|delet\w*|remov\w*|desmarc\w*|quant\w*|quais|list\w*|mostr\w*|ignor\w*)\b/.test(t0)) return true;
  return detectAgendarStrict(text);
}

function detectAgendarStrict(text: string): boolean {
  const t = norm(text);
  // pedidos de apagar/cancelar/consultar não são "agendar" (mesmo citando "agendamentos")
  if (/\b(cancel\w*|apag\w*|exclu\w*|delet\w*|remov\w*|desmarc\w*|quant\w*|quais|list\w*|mostr\w*|ignor\w*)\b/.test(t) && !/\b(agendar|marcar|reservar)\b/.test(t)) return false;
  return (
    /\b(agend(ar|e|ei|ando|a)|marc(ar|a|ando)|reserv(ar|a|e|ando))\b/.test(t) ||
    /\b(coloc\w*|bot\w*|poe|pon\w*|encaix\w*) (isso |ela |ele )?(na|a) agenda\b/.test(t) ||
    /\bhorario (pro|pra|para|do|da|de)\b/.test(t) ||
    /\bpreciso de (um|o) horario\b/.test(t) ||
    /^\s*(novo )?agendamento\b/.test(t) ||
    /\b(um|novo) agendamento\b/.test(t) ||
    /\bquero (um |fazer um )?agendamento\b/.test(t)
  );
}

const DATE_WORD = /\b(amanha|hoje|ontem|depois de amanha|daqui|segunda|terca|quarta|quinta|sexta|sabado|domingo|dia \d+|\d{1,2}\/\d{1,2}|as \d+|\d{1,2}h|\d{1,2}:\d{2}|de manha|de tarde|de noite|semana|proxim[oa]|primeiro de|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|observacao|obs|tipo de servico|servico|essa|esse|esta|este|que vem|mes|anteontem|agora|cedo|fim do|ate|das|por|valor|duracao|gratis|desconto|com desconto)\b/;
const TITLES = /^(?:dr|dra|doutor|doutora|dona|dono|seu|sr|sra|senhor|senhora|sr\.|sra\.|dr\.|dra\.)\s+/;

/** Nome de pessoa plausível (letras, espaço, hífen, apóstrofo, ponto; até 5 palavras). Recusa números, símbolos e frases soltas. */
export function plausibleName(name: string): boolean {
  const n = name.trim();
  if (n.length < 2 || n.length > 80) return false;
  if (!/^[\p{L}][\p{L}'’.\- ]*$/u.test(n)) return false;
  if (/\b(e|com)\b/.test(norm(n))) return false; // "Juliana e Marcos": mais de uma pessoa
  const words = n.split(/\s+/);
  if (words.length > 5) return false;
  return !/^(nao|sim|talvez|tanto faz|qualquer|nenhum|ninguem|nada|sei la|nao sei|esquece|aquele|aquela)\b/.test(norm(n));
}

/** Primeira palavra que mostra que o trecho NÃO é um nome ("pra marcar um corte…", "para hoje"). */
const NOT_NAME_START = /^(marcar|agendar|fazer|ver|ter|ir|vir|reservar|cortar|lavar|pintar|hidratar|polir|atender|encaixar|trazer|levar|passar|eu|voce|ele|ela|mim|nos|gente|hoje|amanha|semana|dia|as|um|uma)$/;

function cleanCustomerFragment(raw: string): string | undefined {
  let fragment = raw.replace(/^(?:para|pra|pro)\s+/, "").replace(TITLES, "").replace(/^(?:o|a)\s+/, "").replace(TITLES, "");
  // vírgula, ponto e vírgula, interrogação e dois-pontos encerram o nome ("pro João Pedro, de preferência amanhã")
  fragment = fragment.split(/[,;?!:]|\s-\s/)[0]!;
  const cut = DATE_WORD.exec(fragment);
  if (cut) fragment = fragment.slice(0, cut.index);
  fragment = fragment.replace(/\s+com\s+.*$/, "").trim().replace(/^(?:e|eh|o|a)\s+/, "").replace(/\s+(com|e|que|as|a|no|na|em|da|de|do|dos|das)$/, "").trim();
  const words = fragment.split(" ").filter(Boolean).slice(0, 5);
  if (words.length === 0 || NOT_NAME_START.test(words[0]!)) return undefined;
  return words.join(" ");
}

/** Nome do cliente citado ("pro cliente João Ferreira amanhã…" → "joao ferreira"). */
export function extractCustomerText(text: string): string | undefined {
  let t = spokenNumbersToDigits(norm(text)).replace(/\b(?:pra|para) mim\b/g, " ");
  // a observação ("observação cliente prefere cera") não é parte do pedido
  const obs = /\b(observacao|observacoes|obs)\b/.exec(t);
  if (obs) t = t.slice(0, obs.index);
  const starts: { index: number; rest: string }[] = [];
  for (const m of t.matchAll(/\bcliente\s*:?\s+(.+)/g)) starts.push({ index: m.index!, rest: m[1]! });
  for (const m of t.matchAll(/\b(?:pro|pra|para)\s+(?:o |a )?(?:cliente\s+)?(.+)/g)) starts.push({ index: m.index!, rest: m[1]! });
  // vale o que aparece primeiro e parece nome ("… dá pra marcar um corte pro João Pedro" ignora o primeiro "pra")
  for (const c of starts.sort((a, b) => a.index - b.index)) {
    const name = cleanCustomerFragment(c.rest);
    if (name) return name;
  }
  return undefined;
}

const SERVICE_MIN_COVERAGE = 0.5;

/** Recupera o nome como a pessoa escreveu (com acento e maiúsculas) a partir do texto normalizado. */
export function originalCustomerName(original: string, normalized: string): string {
  const words = original.split(/\s+/).filter(Boolean);
  const wanted = normalized.split(" ").filter(Boolean);
  for (let i = 0; i + wanted.length <= words.length; i += 1) {
    if (wanted.every((w, k) => norm(words[i + k]!.replace(/[.,;!?]+$/g, "")) === w)) return words.slice(i, i + wanted.length).map((w) => w.replace(/[.,;!?]+$/g, "")).join(" ");
  }
  return wanted.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Palavra do nome que só existe em UM serviço e foi dita ("polimento" → "Polimento Técnico Completo"). */
function distinctiveHit(text: string, service: CatalogService, all: CatalogService[]): boolean {
  const saidList = [...new Set(tokens(text))];
  return tokens(service.name).some(
    (t) => t.length >= 5 && !/^\d+$/.test(t) && all.filter((o) => tokens(o.name).includes(t)).length === 1 && saidList.some((x) => x === t || (x.length >= 5 && t.startsWith(x)) || fuzzyEq(x, t))
  );
}

export function matchServices(text: string, services: CatalogService[]): CatalogService[] {
  const scored = services
    .map((s) => ({ s, score: Math.max(nameCoverage(text, s.name), distinctiveHit(text, s, services) ? SERVICE_MIN_COVERAGE : 0) }))
    .filter((x) => x.score >= SERVICE_MIN_COVERAGE)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) {
    // palavra comum a vários serviços ("teste"): lista os que a contêm para a pessoa escolher
    const said = new Set(tokens(text));
    const shared = services.filter((s) => tokens(s.name).some((t) => t.length >= 5 && said.has(t) && services.filter((o) => tokens(o.name).includes(t)).length >= 2));
    return shared.length >= 2 && shared.length <= 4 ? shared : [];
  }
  const best = scored[0]!.score;
  // só os que empatam ou chegam perto do melhor: se sobrar mais de um, a Cláudia pergunta
  const near = scored.filter((x) => best - x.score < 0.15).map((x) => x.s);
  if (near.length === 1 && best < 1) {
    // acertou por uma palavra que outros serviços também têm ("teste" → vários): pergunta em vez de escolher um
    const said = new Set(tokens(text));
    const hit = tokens(near[0]!.name).filter((t) => said.has(t));
    const sharing = hit.length > 0 && hit.every((t) => services.filter((o) => tokens(o.name).includes(t)).length >= 2);
    if (sharing) {
      const others = services.filter((o) => o !== near[0] && tokens(o.name).some((t) => hit.includes(t)));
      if (others.length > 0 && others.length < 6) return [...near, ...others];
    }
  }
  if (near.length < 2) return near;
  // pergunta ambígua ("lavagem"): lista também os serviços de nome longo que contêm a palavra
  const extra = services.filter((s) => !near.includes(s) && nameCoverage(text, s.name) >= 0.3);
  return [...near, ...extra];
}

const REF_IGNORE = new Set(["tecnico", "tecnica", "para", "que", "esse", "essa", "ele", "ela", "mim", "voce", "cliente", "servico"]);
/** Palavras que a pessoa usou para apontar o profissional ("com o Felipe", "responsável Felipe", "vai ser o Felipe"). */
export function professionalRefs(text: string): Set<string> {
  const t = norm(text);
  const wanted = new Set<string>();
  const cues = /(?:\bcom (?:o |a )?|@|\bprofissional\s*:?\s*(?:o |a )?|\bpelo |\bpela |\bresponsavel\s*:?\s*(?:tecnico |tecnica )?(?:o |a )?|\btecnic[oa]\s*:?\s*(?:o |a )?|\bvai ser (?:o |a )|\bquem faz (?:e |eh |sera )?(?:o |a )?|\bfica com (?:o |a )?|\batendente\s*:?\s*(?:o |a )?)([a-z0-9]+)((?: (?:e|ou) (?:com )?(?:o |a )?[a-z]{3,})*)/g;
  for (const m of t.matchAll(cues)) {
    if (!REF_IGNORE.has(m[1]!)) wanted.add(m[1]!);
    // "com Ana e Felipe" / "com Ana ou com Felipe": todos os citados
    for (const extra of (m[2] ?? "").matchAll(/(?:e|ou) (?:com )?(?:o |a )?([a-z]{3,})/g)) if (!REF_IGNORE.has(extra[1]!)) wanted.add(extra[1]!);
  }
  return wanted;
}

/** A pessoa apontou um profissional ("com o Zeca") mas ninguém do cadastro tem esse nome. */
export function unknownProfessionalRef(text: string, professionals: CatalogProfessional[]): string | undefined {
  const t = norm(text);
  const strong = /(?:\bcom (?:o|a) |\bpelo |\bpela |\bresponsavel |\bprofissional |\bvai ser (?:o|a) )([a-z]{3,})/.exec(t);
  if (!strong || REF_IGNORE.has(strong[1]!)) return undefined;
  return matchProfessionals(text, professionals).length === 0 ? strong[1] : undefined;
}

/** Trecho que parece ser o serviço pedido ("agendar enceramento pro João…" → "enceramento"). */
export function extractServiceText(text: string): string | undefined {
  const t = norm(text);
  const m = /\b(?:agend\w*|marc\w*|reserv\w*)\s+(?:(?:um|uma|o|a|de|do|da)\s+)*(.+)/.exec(t);
  if (!m) return undefined;
  let frag = m[1]!;
  const cut = /\b(pro|pra|para|cliente|com|amanha|hoje|ontem|segunda|terca|quarta|quinta|sexta|sabado|domingo|dia|as|em|no|na|do|da)\b|\d/.exec(frag);
  if (cut) frag = frag.slice(0, cut.index);
  frag = frag.replace(/^(tipo de servico|servico|atendimento|horario)\s*/, "").trim();
  if (!frag || /^(horario|atendimento|servico|algo|alguma coisa|isso|ele|ela)$/.test(frag)) return undefined;
  return frag.split(" ").slice(0, 4).join(" ");
}

export function matchProfessionals(text: string, professionals: CatalogProfessional[]): CatalogProfessional[] {
  const t = norm(text);
  const wanted = professionalRefs(text);
  if (wanted.size === 0) return [];
  return professionals.filter((p) => tokens(p.name).some((tok) => wanted.has(tok) || [...wanted].some((w) => (w.length >= 3 && tok.startsWith(w)) || fuzzyEq(w, tok))));
}

/**
 * Profissional citado SEM gatilho ("Ana Paula, corte, João Pedro…", "se a Ana puder"): vale se o nome completo aparece
 * ou se o primeiro nome (3+ letras, único entre os profissionais) aparece e não faz parte do nome do cliente.
 */
export function looseProfessionals(text: string, professionals: CatalogProfessional[], customerText?: string): CatalogProfessional[] {
  const said = tokens(text);
  const customerTokens = new Set(customerText ? tokens(customerText) : []);
  const hits = professionals.filter((p) => {
    const toks = tokens(p.name);
    const first = toks[0];
    if (!first) return false;
    const fullName = toks.length >= 2 && toks.slice(0, 2).every((tk) => said.some((x) => tokenMatches(x, tk)));
    if (fullName) return !toks.slice(0, 2).every((tk) => customerTokens.has(tk));
    const unique = professionals.filter((o) => tokens(o.name)[0] === first).length === 1;
    return first.length >= 3 && unique && !customerTokens.has(first) && said.some((x) => x === first || fuzzyEq(x, first));
  });
  return hits;
}

/** "agendar [a|o] Marcos Vinícius para polimento": o cliente vem ANTES do "para" e o serviço depois. */
function customerBeforePara(text: string): string | undefined {
  const t = norm(text);
  const m = /\bagend\w*\s+(?:a |o )?(.+?)\s+(?:para|pra|pro)\s+/.exec(t);
  return m ? m[1]!.trim() : undefined;
}

/** Sequência de 2+ palavras com inicial maiúscula no meio da frase ("… polimento Marcos Vinícius Albuquerque 18/11"). */
function capitalizedName(text: string): string | undefined {
  const re = /\p{Lu}[\p{L}'’-]+(?:\s+(?:d[aeo]s?\s+)?\p{Lu}[\p{L}'’-]+)+/gu;
  for (const m of text.matchAll(re)) {
    if (m.index === 0) continue; // início da frase ("Agendar Polimento…")
    if (/^(oi|ola|bom|boa)\b/.test(norm(m[0]))) continue;
    return norm(m[0]);
  }
  return undefined;
}

/** Tira da frase os trechos de valor, duração e observação para não confundir com nome de serviço ("duração 45 minutos" ≠ "Teste Duracao"). */
export function withoutExtras(text: string): string {
  return text
    .replace(/\b(?:observa[cç][aã]o|observa[cç][oõ]es|obs)\s*[:\-]?.*$/i, " ")
    .replace(/\b(?:dura[cç][aã]o(?: de)?|durando|dura|durante)\s*\d+\s*(?:horas?|h|minutos?|min)\b/gi, " ")
    .replace(/\bpor\s+(?:\d+|uma|duas|meia)\s+(?:horas?|minutos?|min)\b/gi, " ")
    .replace(/\b(?:valor|pre[cç]o|cobrar)\s*(?:de |para |em )?(?:r\$\s*)?\d+(?:[.,]\d{1,2})?\s*(?:reais|real)?/gi, " ");
}

export function understandAgendar(text: string, catalog: AgendaCatalog, clock: ChatClock): AgendarUnderstanding {
  const services = matchServices(withoutExtras(text), catalog.services);
  let customerText = extractCustomerText(text);
  // o "para" apontou o serviço ("agendar a Marcos para polimento"): o cliente é quem vem antes dele
  const allServiceWords = (ct: string) => {
    const tk = tokens(ct);
    const words = new Set(catalog.services.flatMap((sv) => tokens(sv.name)));
    return tk.length > 0 && tk.every((w) => words.has(w) || [...words].some((x) => w.length >= 4 && x.startsWith(w)));
  };
  if (customerText && allServiceWords(customerText)) {
    const before = customerBeforePara(text);
    customerText = before && matchServices(before, catalog.services).length === 0 ? before : undefined;
  }
  if (!customerText) {
    const cap = capitalizedName(text);
    // nome de profissional ou de serviço com maiúsculas não é o cliente
    const capTokens = cap ? tokens(cap) : [];
    const isStaff = capTokens.length > 0 && catalog.professionals.some((p) => capTokens.every((tok) => tokens(p.name).includes(tok)));
    if (cap && !isStaff && matchServices(cap, catalog.services).length === 0) customerText = cap;
  }
  return {
    isAgendar: detectAgendar(text),
    services,
    professionals: matchProfessionals(text, catalog.professionals),
    customerText,
    when: parseDateTimePt(text, clock),
  };
}

// ---------------------------------------------------------------------------------------------------- rascunho
export interface AgendarSlots {
  servico?: { id: string; name: string; durationMinutes: number | null; price: number };
  /** isNew: ainda não existe no cadastro; é criado só quando a pessoa confirma (id vazio) */
  cliente?: { id: string; name: string; isNew?: boolean };
  profissional?: { id: string; name: string; durationOverride?: number | null; priceOverride?: number | null };
  /** YYYY-MM-DD */
  date?: string;
  /** HH:mm */
  time?: string;
  /** informado pelo usuário ("das 14 às 16"): vira duração = diferença */
  endTime?: string;
  /** só preenchido quando o usuário muda a duração ou o valor */
  priceOverride?: number;
  /** duração pedida pela pessoa ("por 1 hora"); vale no lugar da do serviço/profissional */
  durationMinutes?: number;
  notes?: string;
  /** "tarde" etc. quando só disse a faixa */
  dayPart?: string;
}

export type AgendarField = "servico" | "cliente" | "profissional" | "inicio";

/** Ordem de pergunta = ordem desta lista. */
export const AGENDAR_REQUIRED: AgendarField[] = ["servico", "cliente", "profissional", "inicio"];

export function missingFields(slots: AgendarSlots): AgendarField[] {
  const missing: AgendarField[] = [];
  if (!slots.servico) missing.push("servico");
  if (!slots.cliente) missing.push("cliente");
  if (!slots.profissional) missing.push("profissional");
  if (!slots.date || !slots.time) missing.push("inicio");
  return missing;
}

/** Profissionais que podem fazer o serviço (ativos e habilitados). */
export function eligibleProfessionals(catalog: AgendaCatalog, serviceId: string | undefined): CatalogProfessional[] {
  return catalog.professionals.filter((p) => p.active && (!serviceId || p.serviceIds.includes(serviceId)));
}

export interface Question {
  /** campos que a pergunta cobre (ex.: início e profissional juntos, como no seu exemplo) */
  fields: AgendarField[];
  text: string;
  options?: { id: string; label: string }[];
}

/**
 * Próxima pergunta. Agrupa "início" e "profissional" quando os dois faltam (uma pergunta só); o resto, um por vez.
 * `null` quando nada obrigatório falta.
 */
export function nextQuestion(slots: AgendarSlots, catalog: AgendaCatalog): Question | null {
  const missing = missingFields(slots);
  if (missing.length === 0) return null;
  const first = missing[0]!;
  if (first === "servico") {
    if (catalog.services.length === 0) return { fields: ["servico"], text: "Sua empresa ainda não tem nenhum serviço ativo cadastrado. Cadastre o serviço em Serviços e peça de novo." };
    return { fields: ["servico"], text: "Qual serviço?", options: catalog.services.map((s) => ({ id: s.id, label: s.name })) };
  }
  if (first === "cliente") return { fields: ["cliente"], text: "Para qual cliente?" };

  const wantsProf = missing.includes("profissional");
  const wantsStart = missing.includes("inicio");
  const pros = eligibleProfessionals(catalog, slots.servico?.id);
  const profOptions = pros.map((p) => ({ id: p.id, label: p.name }));
  if (wantsProf && wantsStart && slots.time && !slots.date) {
    return { fields: ["inicio", "profissional"], text: `Para que dia, às ${slots.time}? E quem vai fazer o serviço?`, options: profOptions };
  }
  if (wantsProf && wantsStart) {
    const duration = slots.servico?.durationMinutes ? ` (o término eu calculo: ${formatDuration(slots.servico.durationMinutes)})` : "";
    return {
      fields: ["inicio", "profissional"],
      text: `Que dia e horário começa${duration}? E quem vai fazer o serviço?`,
      options: profOptions,
    };
  }
  if (wantsProf) return { fields: ["profissional"], text: pros.length ? "Quem vai fazer o serviço?" : "Nenhum profissional ativo faz esse serviço. Ajuste em Equipe.", options: profOptions };
  const partial =
    slots.dayPart && !slots.time
      ? `Em que horário ${slots.dayPart === "manha" ? "da manhã" : `da ${slots.dayPart}`}?`
      : slots.date && !slots.time
        ? "A que horas?"
        : slots.time && !slots.date
          ? `Para que dia, às ${slots.time}?`
          : "Que dia e horário começa?";
  return { fields: ["inicio"], text: partial };
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h}h${String(m).padStart(2, "0")}` : h ? `${h}h` : `${m} min`;
}

// ---------------------------------------------------------------------------------------------------- validação
export interface Validation {
  blocks: string[];
  warnings: string[];
  /** início e fim finais (se der para calcular) */
  start?: LocalDateTime;
  end?: LocalDateTime;
  durationMinutes?: number;
}

const toLocal = (date: string, time: string): LocalDateTime => `${date}T${time}`;
const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && aEnd > bStart;

/** Duração efetiva: a do serviço, ou a diferença "das 14 às 16" se o usuário disse o término. */
export function effectiveDuration(slots: AgendarSlots): number | null {
  if (slots.time && slots.endTime) {
    const d = minutesOf(slots.endTime) - minutesOf(slots.time);
    return d > 0 ? d : null;
  }
  if (slots.durationMinutes && slots.durationMinutes > 0) return slots.durationMinutes;
  // mesma precedência do banco (create_appointment): duração do profissional para o serviço, depois a do serviço
  const d = slots.profissional?.durationOverride ?? slots.servico?.durationMinutes ?? 0;
  return d > 0 ? d : null;
}

/** Profissional como entra no rascunho, já com as sobrescritas dele para o serviço escolhido. */
export function professionalSlot(pro: CatalogProfessional, serviceId: string | undefined): NonNullable<AgendarSlots["profissional"]> {
  const o = serviceId ? pro.overrides?.[serviceId] : undefined;
  return { id: pro.id, name: pro.name, durationOverride: o?.durationMinutes ?? null, priceOverride: o?.price ?? null };
}

/**
 * Regras do módulo, na mesma ordem das mensagens do banco/tela (docs/chat-ai/02 §2.1.1). Puro: a agenda do profissional
 * chega pronta. O banco refaz tudo na gravação, então isto serve para avisar cedo e sugerir alternativas.
 */
export function validateAgendar(
  slots: AgendarSlots,
  ctx: { clock: ChatClock; catalog: AgendaCatalog; schedule: ProfessionalSchedule | null }
): Validation {
  const blocks: string[] = [];
  const warnings: string[] = [];
  const result: Validation = { blocks, warnings };

  if (slots.servico && !effectiveDuration(slots) && !slots.endTime) {
    blocks.push(`O serviço "${slots.servico.name}" está sem duração cadastrada. Informe o horário de término ou cadastre a duração do serviço.`);
  }
  if (slots.servico && slots.profissional) {
    const pro = ctx.catalog.professionals.find((p) => p.id === slots.profissional!.id);
    if (!pro || !pro.active) blocks.push(`${slots.profissional.name} não está ativo na agenda.`);
    else if (!pro.serviceIds.includes(slots.servico.id)) {
      const who = eligibleProfessionals(ctx.catalog, slots.servico.id).map((p) => p.name);
      blocks.push(`${slots.profissional.name} não faz ${slots.servico.name}.${who.length ? ` Quem faz: ${who.join(", ")}.` : ""}`);
    }
  }
  if (slots.endTime && slots.time && minutesOf(slots.endTime) <= minutesOf(slots.time)) {
    blocks.push("O término precisa ser depois do início.");
  }

  const duration = effectiveDuration(slots);
  if (slots.date && slots.time && duration) {
    const startLocal = toLocal(slots.date, slots.time);
    const endParts = addMinutesToLocal(slots.date, slots.time, duration);
    const endLocal = toLocal(endParts.date, endParts.time);
    result.start = startLocal;
    result.end = endLocal;
    result.durationMinutes = duration;

    const schedule = ctx.schedule;
    if (schedule && slots.profissional) {
      const name = slots.profissional.name;
      const weekday = weekdayOf(slots.date);
      if (schedule.availability.length > 0) {
        const rules = schedule.availability.filter((r) => r.weekday === weekday);
        if (rules.length === 0) blocks.push(`${name} não atende em ${WEEKDAY_NAMES[weekday]} (dia sem expediente).`);
        else {
          const fits = rules.some((r) => minutesOf(slots.time!) >= minutesOf(r.start) && minutesOf(endParts.time) <= minutesOf(r.end) && endParts.date === slots.date);
          if (!fits) {
            const hours = rules.map((r) => `${r.start} a ${r.end}`).join(" e ");
            const startsInside = rules.some((r) => minutesOf(slots.time!) >= minutesOf(r.start) && minutesOf(slots.time!) < minutesOf(r.end));
            blocks.push(
              startsInside && slots.servico
                ? `${name} atende de ${hours} nesse dia, mas ${slots.servico.name} dura ${formatDuration(duration)}: começando às ${slots.time} terminaria às ${endParts.time}${endParts.date !== slots.date ? " do dia seguinte" : ""}, depois do fim do expediente.`
                : `${name} não atende nesse horário. Nesse dia atende de ${hours}.`
            );
          }
        }
      }
      const block = schedule.blocks.find((b) => overlaps(startLocal, endLocal, b.start, b.end));
      if (block) blocks.push(`${name} está com um bloqueio nesse horário${block.reason ? ` (${block.reason})` : ""}.`);
      const busy = schedule.busy.find((b) => overlaps(startLocal, endLocal, b.start, b.end));
      if (busy) blocks.push(`Esse horário já está ocupado para ${name}${busy.label ? ` (${busy.label})` : ""}.`);
    }

    // avisos (não bloqueiam)
    const nowLocal = toLocal(ctx.clock.today, `${String(Math.floor(ctx.clock.nowMinutes / 60)).padStart(2, "0")}:${String(ctx.clock.nowMinutes % 60).padStart(2, "0")}`);
    if (startLocal < nowLocal) warnings.push("Esse horário já passou. Confira a data se não quiser registrar um atendimento passado.");
    if (endParts.date !== slots.date && endParts.time !== "00:00") warnings.push(`Esse atendimento termina depois da meia-noite (${endParts.time} do dia seguinte). Confira o horário.`);
    const yearAhead = addMinutesToLocal(ctx.clock.today, "00:00", 366 * 1440).date;
    if (slots.date > yearAhead) warnings.push("Essa data está a mais de um ano. Confira.");
  }
  return result;
}

/** Sugere horários livres do dia (de 30 em 30 min) dentro do expediente, sem bloqueio, sem conflito e sem passado. */
export function suggestFreeStarts(
  date: string,
  durationMinutes: number,
  schedule: ProfessionalSchedule,
  clock: ChatClock,
  limit = 6
): string[] {
  const weekday = weekdayOf(date);
  const windows = schedule.availability.length > 0 ? schedule.availability.filter((r) => r.weekday === weekday).map((r) => [minutesOf(r.start), minutesOf(r.end)] as const) : [[8 * 60, 18 * 60] as const];
  const out: string[] = [];
  for (const [from, to] of windows) {
    for (let start = from; start + durationMinutes <= to; start += 30) {
      const time = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
      const end = addMinutesToLocal(date, time, durationMinutes);
      const s = toLocal(date, time);
      const e = toLocal(end.date, end.time);
      if (date === clock.today && start <= clock.nowMinutes) continue;
      if (schedule.blocks.some((b) => overlaps(s, e, b.start, b.end))) continue;
      if (schedule.busy.some((b) => overlaps(s, e, b.start, b.end))) continue;
      out.push(time);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- cartão
export interface ConfirmCardField {
  label: string;
  value: string;
  /** abre o cadastro (cliente, profissional, serviço) */
  link?: { kind: "cliente" | "profissional" | "servico"; id: string };
  /** origem do valor quando não foi dito ("preço do serviço", "calculado") */
  note?: string;
}

export interface ConfirmCard {
  module: "Agenda";
  title: string;
  risk: "R1";
  fields: ConfirmCardField[];
  warnings: string[];
  blocks: string[];
}

export const formatBRL = (value: number): string => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function summarizeAgendar(slots: AgendarSlots, validation: Validation): ConfirmCard | null {
  if (missingFields(slots).length > 0 || !slots.servico || !slots.cliente || !slots.profissional || !slots.date || !slots.time) return null;
  const duration = validation.durationMinutes ?? effectiveDuration(slots);
  const end = duration ? addMinutesToLocal(slots.date, slots.time, duration) : null;
  const price = slots.priceOverride ?? slots.profissional.priceOverride ?? slots.servico.price;
  return {
    module: "Agenda",
    title: "Novo agendamento",
    risk: "R1",
    fields: [
      slots.cliente.isNew
        ? { label: "Cliente", value: slots.cliente.name, note: "cliente novo: será cadastrado quando você confirmar" }
        : { label: "Cliente", value: slots.cliente.name, link: { kind: "cliente" as const, id: slots.cliente.id } },
      { label: "Serviço", value: slots.servico.name, link: { kind: "servico", id: slots.servico.id } },
      { label: "Profissional", value: slots.profissional.name, link: { kind: "profissional", id: slots.profissional.id } },
      {
        label: "Quando",
        value: `${formatDatePt(slots.date)} · ${slots.time}${end ? ` às ${end.time}${end.date !== slots.date ? " (dia seguinte)" : ""}` : ""}${duration ? ` (${formatDuration(duration)})` : ""}`,
        note: slots.endTime ? undefined : "término calculado pela duração do serviço",
      },
      {
        label: "Valor",
        value: formatBRL(price),
        note: slots.priceOverride !== undefined ? undefined : slots.profissional.priceOverride != null ? "valor do profissional para este serviço" : "preço do serviço",
      },
      ...(slots.notes ? [{ label: "Observações", value: slots.notes }] : []),
    ],
    warnings: validation.warnings,
    blocks: validation.blocks,
  };
}


// ---------------------------------------------------------------------------------------------------- extras da frase
export interface AgendarExtras {
  /** valor combinado ("valor 80", "por R$ 35", "grátis" = 0) */
  priceOverride?: number;
  /** porcentagem de desconto sobre o preço do serviço */
  discountPct?: number;
  /** duração em minutos ("por 1 hora", "duração 45 minutos") */
  durationMinutes?: number;
  notes?: string;
  /** coisas que o chat ainda não faz e que não devem ser ignoradas em silêncio */
  unsupported: ("recorrencia" | "duplicar" | "desconto-sem-valor")[];
}

const NUM_WORDS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, meia: 0.5, meio: 0.5 };

/** Valor, duração e observação ditos junto do pedido. Tudo opcional; nunca lança erro. */
export function parseExtras(text: string): AgendarExtras {
  const extras: AgendarExtras = { unsupported: [] };
  let body = text;
  const obs = /\b(?:observa[cç][aã]o|observa[cç][oõ]es|obs)\s*[:\-]?\s*(.+)$/i.exec(body);
  if (obs) {
    const note = obs[1]!.replace(/\s+/g, " ").trim().slice(0, 200);
    if (note) extras.notes = note;
    body = body.slice(0, obs.index);
  }
  const t = norm(body).replace(/(\d)\.(\d{3})(?!\d)/g, "$1$2");

  const toNum = (s: string) => Number(s.replace(",", "."));
  const price =
    /\b(?:valor|preco|cobrar|cobra|cobre)\s*(?:de |para |em |do servico )?(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/.exec(t) ??
    /\br\$\s*(\d+(?:[.,]\d{1,2})?)/.exec(t) ??
    /\b(\d+(?:[.,]\d{1,2})?)\s*(?:reais|real)\b/.exec(t);
  if (price) {
    const v = toNum(price[1]!);
    if (Number.isFinite(v) && v >= 0 && v <= 1_000_000) extras.priceOverride = Math.round(v * 100) / 100;
  } else if (/\b(gratis|gratuito|de graca|cortesia|sem cobrar|sem custo)\b/.test(t)) extras.priceOverride = 0;

  const pct = /\b(\d{1,2})\s*%\s*(?:de )?desconto\b/.exec(t) ?? /\bdesconto de (\d{1,2})\s*%/.exec(t);
  if (pct) extras.discountPct = Math.min(100, Number(pct[1]));
  else if (/\bcom desconto\b|\bdar desconto\b|\bdesconto\b/.test(t) && extras.priceOverride === undefined) extras.unsupported.push("desconto-sem-valor");

  const dur =
    /\b(?:por|durante|duracao(?: de)?|durando|dura)\s*(\d+|uma|duas|meia|meio)\s*(horas?|h|minutos?|min)\b(?:\s*e\s*(meia|\d{1,2}))?/.exec(t) ??
    /\b(\d+)\s*(minutos?|min)\s*de duracao\b/.exec(t);
  if (dur) {
    const raw = dur[1]!;
    const n = /^\d+$/.test(raw) ? Number(raw) : (NUM_WORDS[raw] ?? 0);
    const unit = dur[2]!;
    let minutes = unit.startsWith("h") ? n * 60 : n;
    if (dur[3]) minutes += dur[3] === "meia" ? 30 : Number(dur[3]);
    if (minutes >= 5 && minutes <= 12 * 60) extras.durationMinutes = Math.round(minutes);
  }

  if (/\b(toda (a )?(semana|segunda|terca|quarta|quinta|sexta|sabado)|todos os dias|todo dia|semanalmente|mensalmente|recorrente|se repete|repete|repetir)\b/.test(t)) extras.unsupported.push("recorrencia");
  if (/\b(duplic\w*|copi\w+ (isso|esse|este))\b/.test(t)) extras.unsupported.push("duplicar");
  return extras;
}

/** Serviços citados em partes separadas por "e", "," ou "+" ("corte e barba pro João"): um por parte, na ordem em que aparecem. */
export function mentionedServices(text: string, services: CatalogService[]): CatalogService[] {
  const parts = norm(text).split(/\s+e\s+|,|\+|\s+mais\s+/);
  const out: CatalogService[] = [];
  for (const part of parts) {
    const hit = matchServices(part, services);
    if (hit.length === 1 && !out.includes(hit[0]!)) out.push(hit[0]!);
  }
  return out;
}
