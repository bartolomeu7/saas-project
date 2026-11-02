#!/usr/bin/env node
/**
 * Verificação pós-deploy (somente leitura): confere se o site publicado serve o commit esperado.
 *
 *   node scripts/verify-production.mjs                      # compara com origin/main
 *   node scripts/verify-production.mjs --sha 8694158        # commit explícito (7+ caracteres)
 *   node scripts/verify-production.mjs --base https://primeges.com.br --marker home-v3-band
 *
 * Sem dependências: usa só o Node (fetch) e o git local. Só faz GET/HEAD.
 * Saída com código 1 se qualquer checagem falhar.
 */
import { execFileSync } from "node:child_process";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function markers() {
  const out = [];
  process.argv.forEach((value, i) => {
    if (value === "--marker" && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
}

const base = arg("base", "https://primeges.com.br").replace(/\/$/, "");
const expected = (arg("sha", "") || execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim()).slice(0, 7);
const results = [];

function record(ok, label, detail = "") {
  results.push(ok);
  console.log(`${ok ? "OK   " : "FALHA"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log(`Base: ${base} | commit esperado: ${expected}\n`);

  const home = await fetch(`${base}/?verify=${Date.now()}`, { headers: { "cache-control": "no-cache" } });
  const html = await home.text();
  record(home.status === 200, "Home responde 200", String(home.status));

  const published = /data-build-sha="([0-9a-f]{7})"/.exec(html)?.[1];
  record(published === expected, "Commit publicado no rodapé", `publicado=${published ?? "ausente"} esperado=${expected}`);

  for (const marker of markers()) {
    // Os marcadores vivem no HTML (classes) ou nos CSS referenciados pela página.
    let found = html.includes(marker);
    if (!found) {
      const sheets = [...html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) => m[1]);
      for (const sheet of sheets) {
        const css = await (await fetch(`${base}${sheet}`)).text();
        if (css.includes(marker)) {
          found = true;
          break;
        }
      }
    }
    record(found, `Marcador "${marker}" presente`);
  }

  const login = await fetch(`${base}/login`);
  record(login.status === 200, "/login responde 200", String(login.status));

  const apex = new URL(base).host;
  if (!apex.startsWith("www.") && !apex.endsWith("vercel.app")) {
    try {
      const www = await fetch(`https://www.${apex}/login`, { redirect: "manual" });
      const location = www.headers.get("location") ?? "";
      record(
        [301, 307, 308].includes(www.status) && location.startsWith(`https://${apex}/`),
        "www redireciona para o domínio principal",
        `${www.status} ${location}`,
      );
    } catch (error) {
      record(false, "www redireciona para o domínio principal", error?.cause?.code ?? error.message);
    }
  }

  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${failed === 0 ? "TUDO OK" : `${failed} checagem(ns) falharam`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Erro ao verificar:", error.message);
  process.exit(1);
});
