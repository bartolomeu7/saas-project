import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatFileSize, formatPercent } from "../../src/lib/format.ts";

const read = (rel) => readFileSync(rel, "utf8");

test("percentual e tamanho de arquivo no padrão brasileiro (vírgula decimal)", () => {
  assert.equal(formatPercent(55.555), "55,6%");
  assert.equal(formatPercent(-300), "-300,0%");
  assert.equal(formatPercent(12.345, 2), "12,35%");
  assert.equal(formatFileSize(1536), "1,5 KB");
  assert.equal(formatFileSize(512), "512 B");
  for (const file of [
    "src/components/app/sale-summary-card.tsx",
    "src/components/app/product-form.tsx",
    "src/components/app/service-form.tsx",
    "src/app/(app)/app/vendas/[id]/page.tsx",
  ]) {
    assert.ok(!/toFixed\(\d\)\}?%/.test(read(file)), `${file} ainda usa toFixed com % (ponto decimal)`);
  }
});

test("RH: datas e valores têm piso/teto e centavos", () => {
  const hr = read("src/lib/hr/actions.ts");
  assert.ok(hr.includes('MIN_ATTENDANCE_DATE = "2000-01-01"'));
  assert.ok(hr.includes("Marque presença apenas a partir do ano 2000."), "presença antes de 2000");
  assert.ok(hr.includes("A data do pagamento não pode ser antes do início do período"), "pagamento em 1900");
  assert.ok(hr.includes("Data de início fora do período aceito"), "início 1900/2099");
  assert.ok(hr.includes("O período pode ter no máximo 1 ano."));
  assert.equal((hr.match(/O valor mínimo é R\$ 0,01\./g) ?? []).length, 2, "vale/bônus e valor do funcionário");
  assert.ok(hr.includes("O salário mínimo aceito é R$ 0,01."));
  assert.ok(hr.includes("collapseSpaces(text(formData.get(\"full_name\")))"));
});

test("produto: SKU em maiúsculas e sem espaços repetidos", () => {
  const product = read("src/lib/validations/product.ts");
  assert.ok(product.includes("collapseSpaces(value).toUpperCase()"));
});

test("vendas: campos de quantidade/desconto têm rótulo acessível e Enter salva", () => {
  const items = read("src/components/app/sale-items-table.tsx");
  assert.ok(items.includes("aria-label={`Quantidade de ${item.description}`}"));
  assert.ok(items.includes('event.key === "Enter"'));
  const summary = read("src/components/app/sale-summary-card.tsx");
  assert.ok(summary.includes('aria-label="Desconto manual da venda, em reais"'));
});

test("Clerk: consulta do usuário e lista de sessões tentam de novo em falha de rede", () => {
  assert.ok(read("src/lib/auth/clerk-session.ts").includes("withClerkRetry(() => currentUser())"));
  assert.ok(read("src/lib/auth/session-gate.ts").includes("withClerkRetry(() =>"));
});
