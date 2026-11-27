import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { whatsappNotice } from "../../src/lib/agenda/whatsapp.ts";
import { normalizePhoneBr } from "../../src/lib/chat/phone-br.ts";

const now = new Date("2026-11-26T12:00:00Z");
const base = {
  status: "scheduled",
  starts_at: "2026-11-27T17:30:00Z", // 14:30 em São Paulo
  customer_id: "c1",
  customer_name: "  Maria da Silva ",
  customer_whatsapp: "5511999990000",
  service_name: "Corte & escova #2",
  professional_name: "Ana",
};
const textOf = (notice) => new URL(notice.href).searchParams.get("text");

test("agendado pede confirmação, com dia e hora de São Paulo", () => {
  const notice = whatsappNotice(base, "Studio Bela", now);
  assert.equal(notice.label, "Pedir confirmação no WhatsApp");
  assert.ok(notice.href.startsWith("https://wa.me/5511999990000?text="));
  assert.equal(textOf(notice), "Olá, Maria! Aqui é Studio Bela. Seu horário de Corte & escova #2 está marcado para sexta-feira, 27/11 às 14:30, com Ana. Pode confirmar?");
});

test("confirmado vira lembrete; sem serviço, profissional e nome a frase continua correta", () => {
  const notice = whatsappNotice(
    { ...base, status: "confirmed", customer_name: null, service_name: null, professional_name: null, starts_at: "2026-11-28T03:00:00Z" },
    "A&B = Cia?",
    now
  );
  assert.equal(notice.label, "Enviar lembrete no WhatsApp");
  assert.equal(textOf(notice), "Olá! Aqui é A&B = Cia?. Lembrete do seu horário: sábado, 28/11 às 00:00. Até lá!");
});

test("não aparece para atendimento encerrado, passado, sem cliente ou com data inválida", () => {
  for (const patch of [
    { status: "completed" },
    { status: "cancelled" },
    { status: "no_show" },
    { starts_at: "2026-11-26T12:00:00Z" },
    { starts_at: "2026-11-25T17:30:00Z" },
    { starts_at: "" },
    { customer_id: null },
  ]) {
    assert.equal(whatsappNotice({ ...base, ...patch }, "X", now), null, JSON.stringify(patch));
  }
});

test("sem telefone válido não há link (a tela orienta o cadastro)", () => {
  assert.equal(whatsappNotice({ ...base, customer_whatsapp: null }, "X", now).href, null);
  assert.equal(normalizePhoneBr("(11) 99999-0000")?.e164.slice(1), "5511999990000");
  assert.equal(normalizePhoneBr("123"), null);
});

test("o botão está na lista do dia e no painel do calendário, abrindo em aba isolada", () => {
  const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  assert.match(read("src/app/(app)/app/agenda/page.tsx"), /<AgendaWhatsappLink appointment=\{appointment\}/);
  assert.match(read("src/components/app/agenda-week-calendar.tsx"), /<AgendaWhatsappLink[^>]+showHint/);
  assert.match(read("src/components/app/agenda-whatsapp-link.tsx"), /rel="noopener noreferrer"/);
  assert.match(read("src/lib/agenda/queries.ts"), /customer_whatsapp: normalizePhoneBr/);
});
