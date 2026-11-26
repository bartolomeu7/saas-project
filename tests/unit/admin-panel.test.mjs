import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { formatUptime, timed } from "../../src/lib/admin/server-health.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

describe("painel admin: velocidade", () => {
  it("validar o administrador não chama o serviço de login quando o perfil tem e-mail", () => {
    const queries = read("src/lib/admin/queries.ts");
    const guard = queries.slice(queries.indexOf("export const requirePlatformAdmin"), queries.indexOf("export const requireSuperAdmin"));
    assert.match(guard, /Promise\.all\(\[supabase\.rpc\("is_platform_admin"\), getCurrentProfile\(\)\]\)/);
    assert.match(guard, /profile\.email \?\? \(await getCurrentUser\(\)\)/);
    assert.match(guard, /if \(!isAdmin \|\| !profile\)/);
    assert.doesNotMatch(read("src/app/admin/layout.tsx"), /getCurrentUser/);
  });

  it("o menu carrega a aba por antecipação, com validade curta", () => {
    assert.match(read("src/components/admin/admin-sidebar.tsx"), /<IntentLink/);
    assert.match(read("src/components/admin/intent-link.tsx"), /prefetch=\{intent \? true : null\}/);
    assert.match(read("next.config.js"), /staleTimes: \{ static: 30 \}/);
  });
});

describe("painel admin: menu e busca", () => {
  it("todo item do menu aponta para uma página que existe e toda aba principal está no menu", () => {
    const hrefs = [...read("src/components/admin/admin-nav-items.ts").matchAll(/href: "(\/admin[^"]*)"/g)].map((m) => m[1]);
    assert.equal(new Set(hrefs).size, hrefs.length);
    for (const href of hrefs) assert.ok(existsSync(join(root, "src/app", href, "page.tsx")), href);
    const folders = readdirSync(join(root, "src/app/admin"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "account")
      .map((entry) => `/admin/${entry.name}`);
    for (const folder of folders) assert.ok(hrefs.includes(folder), folder);
  });

  it("a busca do painel exige administrador no servidor", () => {
    const action = read("src/lib/admin/search-actions.ts");
    assert.match(action, /^"use server";/);
    assert.ok(action.indexOf("await requirePlatformAdmin()") < action.indexOf("searchPlatform(query)"));
  });

  it("as animações param para quem pede menos movimento", () => {
    const css = read("src/app/admin/admin.css");
    const animated = [...css.slice(0, css.indexOf("@media")).matchAll(/^(\.prime-admin[^{\n,]*)\{[^}]*animation:/gm)].map((m) => m[1].trim());
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const selector of animated) assert.ok(reduced.includes(selector), selector);
  });
});

describe("painel admin: cartão do servidor", () => {
  it("escreve o tempo ligado", () => {
    assert.equal(formatUptime(59), "0 min");
    assert.equal(formatUptime(3_660), "1 h 1 min");
    assert.equal(formatUptime(90_000), "1 d 1 h");
  });

  it("mede a consulta sem alterar o resultado", async () => {
    const [value, ms] = await timed(async () => 42);
    assert.equal(value, 42);
    assert.ok(ms >= 0);
  });
});
