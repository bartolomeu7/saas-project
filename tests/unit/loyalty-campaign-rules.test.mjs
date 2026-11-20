import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { endOfDaySaoPauloFromDateString, startOfDaySaoPauloFromDateString } from "../../src/lib/timezone.ts";

test("campanha: início 00:00 e fim 23:59:59 no horário de São Paulo (e não em UTC)", () => {
  assert.equal(startOfDaySaoPauloFromDateString("2026-11-20")?.toISOString(), "2026-11-20T03:00:00.000Z");
  assert.equal(endOfDaySaoPauloFromDateString("2026-11-27")?.toISOString(), "2026-11-28T02:59:59.999Z");
  assert.equal(startOfDaySaoPauloFromDateString("não é data"), null);
});

test("campanha: o formulário usa os dias de São Paulo e o bônus tem teto (1 bilhão estourava o inteiro do banco)", () => {
  const actions = readFileSync("src/lib/loyalty/actions.ts", "utf8");
  assert.ok(actions.includes("startOfDaySaoPauloFromDateString(startsAtRaw)"));
  assert.ok(actions.includes("endOfDaySaoPauloFromDateString(endsAtRaw)"));
  assert.ok(!actions.includes("endsAtDate.setHours"), "o fuso do servidor não pode decidir o fim do dia");
  assert.ok(actions.includes("MAX_CAMPAIGN_BONUS_POINTS = 10_000_000"));
  assert.ok(actions.includes("Use datas entre os anos 2000 e 2100."));
  const section = readFileSync("src/components/app/loyalty-campaigns-section.tsx", "utf8");
  assert.ok(!section.includes('timeZone: "UTC"'));
  assert.ok(section.includes("America/Sao_Paulo"));
});
