// Junta as rodadas intercaladas e compara baseline (main publicada) x Etapa 6. Mostra execuções individuais e mediana.
import { readFileSync, existsSync } from "node:fs";
const S = process.argv[2];
const rounds = [1, 2, 3];
const load = (v) => rounds.filter((r) => existsSync(`${S}/e6cmp_${v}_r${r}.json`)).map((r) => JSON.parse(readFileSync(`${S}/e6cmp_${v}_r${r}.json`, "utf8")));
const base = load("base");
const e6 = load("e6");
const med = (a) => { const v = a.filter((x) => x != null).sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const runs = (set, key) => set.flatMap((d) => (d.runs[key] ?? []).filter((r) => !r.error));
const kb = (n) => (n / 1024).toFixed(1);
const pct = (a, b) => (a ? (((b - a) / a) * 100).toFixed(1) + "%" : "-");
const metrics = [
  ["LCP ms", (r) => r.lcp, (n) => Math.round(n)],
  ["FCP ms", (r) => r.fcp, (n) => Math.round(n)],
  ["CLS", (r) => r.cls, (n) => n.toFixed(4)],
  ["TBT ms (lab, não é INP)", (r) => r.tbt, (n) => Math.round(n)],
  ["load ms", (r) => r.load, (n) => Math.round(n)],
  ["requisições (CDP)", (r) => r.net?.ALL?.n, (n) => n],
  ["bytes totais KB (CDP)", (r) => r.net?.ALL?.bytes, kb],
  ["JS transferido KB (CDP Script)", (r) => r.net?.Script?.bytes, kb],
  ["arquivos JS (CDP)", (r) => r.net?.Script?.n, (n) => n],
  ["terceiros KB (CDP)", (r) => r.net?.THIRD?.bytes ?? 0, kb],
  ["terceiros requisições", (r) => r.net?.THIRD?.n ?? 0, (n) => n],
];
const keys = Object.keys(base[0].runs);
for (const key of keys) {
  const A = runs(base, key), B = runs(e6, key);
  console.log(`\n### ${key}  (baseline n=${A.length}, etapa6 n=${B.length})`);
  for (const [name, fn, fmt] of metrics) {
    const a = A.map(fn).filter((x) => x != null), b = B.map(fn).filter((x) => x != null);
    const ma = med(a), mb = med(b);
    if (ma == null || mb == null) continue;
    console.log(`${name.padEnd(32)} base med ${String(fmt(ma)).padStart(8)} | etapa6 med ${String(fmt(mb)).padStart(8)} | Δ ${(fn === metrics[2][1] ? (mb - ma).toFixed(4) : fmt(mb - ma)).toString().padStart(8)} (${pct(ma, mb)})`);
  }
  const lcpA = A.map((r) => Math.round(r.lcp)), lcpB = B.map((r) => Math.round(r.lcp));
  console.log(`  LCP individuais base:   ${lcpA.join(", ")}`);
  console.log(`  LCP individuais etapa6: ${lcpB.join(", ")}`);
}
console.log("\nchrome:", base[0].chrome, "| datas:", base.map((d) => d.date).join(" "), "|", e6.map((d) => d.date).join(" "));
