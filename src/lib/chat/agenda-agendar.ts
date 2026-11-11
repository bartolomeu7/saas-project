import { nameCoverage, norm, tokens } from "./text.ts";
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
  const t = norm(text);
  // pedidos de apagar/cancelar/consultar não são "agendar" (mesmo citando "agendamentos")
  if (/\b(cancel\w*|apag\w*|exclu\w*|delet\w*|remov\w*|desmarc\w*|quant\w*|quais|list\w*|mostr\w*|ignor\w*)\b/.test(t) && !/\b(agendar|marcar|reservar)\b/.test(t)) return false;
  return (
    /\b(agend(ar|e|ei|ando|a)|marc(ar|a|ando)|reserv(ar|a|e|ando))\b/.test(t) ||
    /\b(coloc\w*|bot\w*|poe|pon\w*|encaix\w*) (isso |ela |ele )?(na|a) agenda\b/.test(t) ||
    /\bhorario (pro|pra|para|do|da)\b/.test(t) ||
    /\bpreciso de (um|o) horario\b/.test(t) ||
    /^\s*(novo )?agendamento\b/.test(t) ||
    /\b(um|novo) agendamento\b/.test(t) ||
    /\bquero (um |fazer um )?agendamento\b/.test(t)
  );
}

const DATE_WORD = /\b(amanha|hoje|ontem|depois de amanha|daqui|segunda|terca|quarta|quinta|sexta|sabado|domingo|dia \d+|\d{1,2}\/\d{1,2}|as \d+|\d{1,2}h|\d{1,2}:\d{2}|de manha|de tarde|de noite|semana|proxim[oa]|primeiro de|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|observacao|obs|tipo de servico|servico)\b/;

/** Nome de pessoa plausível (letras, espaço, hífen, apóstrofo, ponto; até 5 palavras). Recusa números, símbolos e frases soltas. */
export function plausibleName(name: string): boolean {
  const n = name.trim();
  if (n.length < 2 || n.length > 80) return false;
  if (!/^[\p{L}][\p{L}'’.\- ]*$/u.test(n)) return false;
  const words = n.split(/\s+/);
  if (words.length > 5) return false;
  return !/^(nao|sim|talvez|tanto faz|qualquer|nenhum|ninguem|nada|sei la|nao sei|esquece|aquele|aquela)\b/.test(norm(n));
}

/** Nome do cliente citado ("pro cliente João Ferreira amanhã…" → "joao ferreira"). */
export function extractCustomerText(text: string): string | undefined {
  const t = spokenNumbersToDigits(norm(text)).replace(/\b(?:pra|para) mim\b/g, " ");
  const a = /\bcliente\s+(.+)/.exec(t);
  const b = /\b(?:pro|pra|para o|para a|para)\s+(?:cliente\s+)?(.+)/.exec(t);
  // vale a que aparece primeiro ("... para Cláudio ... observação cliente prefere cera" usa o "para")
  const m = a && b ? (a.index <= b.index ? a : b) : (a ?? b);
  if (!m) return undefined;
  let fragment = m[1]!;
  const cut = DATE_WORD.exec(fragment);
  if (cut) fragment = fragment.slice(0, cut.index);
  fragment = fragment.replace(/\s+com\s+.*$/, "").trim().replace(/^(?:e|eh|o|a)\s+/, "").replace(/\s+(com|e|que|as|a|no|na|em|da|de|do|dos|das)$/, "").trim();
  const words = fragment.split(" ").filter(Boolean).slice(0, 5);
  return words.length ? words.join(" ") : undefined;
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

export function matchServices(text: string, services: CatalogService[]): CatalogService[] {
  const scored = services
    .map((s) => ({ s, score: nameCoverage(text, s.name) }))
    .filter((x) => x.score >= SERVICE_MIN_COVERAGE)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return [];
  const best = scored[0]!.score;
  // só os que empatam ou chegam perto do melhor: se sobrar mais de um, a Cláudia pergunta
  const near = scored.filter((x) => best - x.score < 0.15).map((x) => x.s);
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
  const cues = /(?:\bcom (?:o |a )?|@|\bprofissional\s+(?:o |a )?|\bpelo |\bpela |\bresponsavel\s+(?:tecnico |tecnica )?(?:o |a )?|\btecnic[oa]\s+(?:o |a )?|\bvai ser (?:o |a )|\bquem faz (?:e |eh |sera )?(?:o |a )?|\bfica com (?:o |a )?)([a-z0-9]+)/g;
  for (const m of t.matchAll(cues)) if (!REF_IGNORE.has(m[1]!)) wanted.add(m[1]!);
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
  return professionals.filter((p) => tokens(p.name).some((tok) => wanted.has(tok) || [...wanted].some((w) => w.length >= 3 && tok.startsWith(w))));
}

export function understandAgendar(text: string, catalog: AgendaCatalog, clock: ChatClock): AgendarUnderstanding {
  return {
    isAgendar: detectAgendar(text),
    services: matchServices(text, catalog.services),
    professionals: matchProfessionals(text, catalog.professionals),
    customerText: extractCustomerText(text),
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
            blocks.push(`${name} não atende nesse horário. Nesse dia atende de ${hours}.`);
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
