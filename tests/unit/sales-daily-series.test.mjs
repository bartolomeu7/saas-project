import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildDailySeries } from "../../src/lib/sales/daily-series.ts";

const FROM = "2026-11-01T03:00:00.000Z"; // 01/11 00:00 em São Paulo
const TO = "2026-11-05T02:59:59.999Z"; // 04/11 23:59 em São Paulo

describe("série diária de faturamento (dashboard)", () => {
  it("gera um ponto por dia, inclusive dias sem venda", () => {
    const series = buildDailySeries([], FROM, TO);
    assert.deepEqual(series.map((p) => p.date), ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
    assert.deepEqual(series.map((p) => p.label), ["01/11", "02/11", "03/11", "04/11"]);
    assert.ok(series.every((p) => p.value === 0 && p.count === 0));
  });

  it("soma por dia no fuso de São Paulo (venda às 23h30 locais fica no dia certo)", () => {
    const series = buildDailySeries(
      [
        { completed_at: "2026-11-02T13:00:00.000Z", total_amount: 100 },
        { completed_at: "2026-11-02T20:00:00.000Z", total_amount: "50.5" },
        { completed_at: "2026-11-04T02:30:00.000Z", total_amount: 10 }, // 03/11 23:30 em São Paulo
      ],
      FROM,
      TO,
    );
    const byDate = Object.fromEntries(series.map((p) => [p.date, p]));
    assert.equal(byDate["2026-11-02"].value, 150.5);
    assert.equal(byDate["2026-11-02"].count, 2);
    assert.equal(byDate["2026-11-03"].value, 10);
    assert.equal(byDate["2026-11-04"].value, 0);
  });

  it("ignora linhas sem data, valores inválidos e datas fora do intervalo", () => {
    const series = buildDailySeries(
      [
        { completed_at: null, total_amount: 999 },
        { completed_at: "2026-11-02T13:00:00.000Z", total_amount: "abc" },
        { completed_at: "2026-10-20T13:00:00.000Z", total_amount: 500 },
      ],
      FROM,
      TO,
    );
    assert.equal(series.reduce((sum, p) => sum + p.value, 0), 0);
    assert.equal(series.find((p) => p.date === "2026-11-02").count, 1);
  });

  it("intervalo inválido ou invertido devolve lista vazia", () => {
    assert.deepEqual(buildDailySeries([], "x", TO), []);
    assert.deepEqual(buildDailySeries([], TO, FROM), []);
  });
});

describe("Onda D2 — dashboard: mesmas consultas, gráfico só com dado real", () => {
  const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
  const page = read("src/app/(app)/app/page.tsx");

  it("usa o intervalo do mês já existente e as estatísticas de sempre", () => {
    assert.match(page, /resolveSalePeriodRange\("month"\)/);
    assert.match(page, /getSaleStats\(company\.id, monthRange\.from, monthRange\.to\)/);
    assert.match(page, /getSalesRevenueByDay\(company\.id, monthRange\.from, monthRange\.to\)/);
  });

  it("a consulta nova é só leitura, filtra empresa e vendas concluídas", () => {
    const queries = read("src/lib/sales/queries.ts");
    const block = queries.slice(queries.indexOf("export const getSalesRevenueByDay"), queries.indexOf("export interface ListSalesParams"));
    assert.match(block, /\.eq\("company_id", companyId\)/);
    assert.match(block, /\.eq\("status", "completed"\)/);
    assert.doesNotMatch(block, /\.(insert|update|delete|upsert|rpc)\(/);
  });

  it("não adiciona biblioteca de gráficos (decisão D1: gráfico em CSS)", () => {
    assert.doesNotMatch(page, /recharts/);
    assert.match(page, /BarChart/);
  });
});
