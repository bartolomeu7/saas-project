/** Fixture: catálogo, clientes e agenda REAIS da empresa de teste (teste1, produção) + 2 profissionais extras. Relógio: quarta 11/11/2026 12:58. */
import { searchCustomers, scanCustomers, customersByPhone } from "../../src/lib/chat/customer-search.ts";

export const CLOCK = { today: "2026-11-11", nowMinutes: 12 * 60 + 58 };
const SERVICES = [
  { id: "s1", name: "Escova Progressiva com Tratamento", durationMinutes: 150, price: 280 },
  { id: "s2", name: "Hidratação Profunda com Cronograma (Teste Completo)", durationMinutes: 90, price: 120 },
  { id: "s3", name: "Polimento Técnico Completo", durationMinutes: 210, price: 280 },
  { id: "s4", name: "Serviço Teste Dono 20", durationMinutes: 45, price: 60 },
  { id: "s5", name: "Serviço Teste Onda E", durationMinutes: 30, price: 50 },
  { id: "s6", name: "Teste Duracao", durationMinutes: 0, price: 50 },
  { id: "s7", name: "Corte Masculino", durationMinutes: 30, price: 45 },
  { id: "s8", name: "Barba", durationMinutes: 20, price: 30 },
];
const PROS = [
  { id: "p1", name: "Rafael Teixeira Lima", active: true, serviceIds: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] },
  { id: "p2", name: "Ana Paula Souza", active: true, serviceIds: ["s1", "s2", "s7", "s8"], overrides: { s7: { durationMinutes: 40, price: 55 } } },
  { id: "p3", name: "Felipe Oliveira", active: true, serviceIds: ["s3", "s7", "s8"] },
];
export const CATALOG = { services: SERVICES, professionals: PROS };
export const CUSTOMERS = [
  ["c1", "Beatriz Cavalcanti Duarte", "11934567812"], ["c2", "Juliana Ferreira Nogueira", "21925679034"], ["c3", "Marcos Vinícius Albuquerque", "11934567821"],
  ["c4", "Ana Beatriz Souza Lima (Teste Completo)", "11933334444"], ["c5", "Cliente Teste Dono 20", ""], ["c6", "Cliente Teste Onda D", ""], ["c7", "João Pedro Santos", "11988887777"], ["c8", "João Paulo Lima", "11977776666"],
].map(([id, name, phone]) => ({ id, name, phone }));
const customerRows = CUSTOMERS;
const findCustomers = async (text) => searchCustomers(customerRows, text);
const wd = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const BUSY = { p1: [["2026-11-12T13:00", "2026-11-12T15:30"], ["2026-11-13T09:00", "2026-11-13T09:30"], ["2026-11-16T09:00", "2026-11-16T09:45"], ["2026-11-17T10:00", "2026-11-17T10:30"]] };
const loadSchedule = async (pid, date) => ({
  availability: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "18:00" })),
  blocks: pid === "p1" && date === "2026-11-12" ? [{ start: "2026-11-12T12:00", end: "2026-11-12T13:00", reason: "Almoço" }] : [],
  busy: (BUSY[pid] ?? []).filter(([s]) => s.startsWith(date)).map(([start, end]) => ({ start, end })),
});
export const PORTS = {
  findCustomers,
  findInactiveCustomers: async () => [],
  findCustomersInText: async (text) => scanCustomers(customerRows, text),
  findCustomersByPhone: async (d) => customersByPhone(customerRows, d),
  loadSchedule,
  loadDayAppointments: async (date) => (date === "2026-11-12" ? [{ start: "13:00", end: "15:30", customer: "Beatriz Cavalcanti Duarte", service: "Hidratação", professional: "Rafael Teixeira Lima", status: "scheduled" }] : []),
};

