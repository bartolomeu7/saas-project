import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import manifest from "../../src/app/manifest.ts";

const read = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");

function pngSize(rel) {
  const buffer = readFileSync(path.join(process.cwd(), rel));
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG", `${rel} não é PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("manifesto: abre em tela cheia em /app, escopo do site, nome e cores da marca", () => {
  const m = manifest();
  assert.equal(m.name, "Prime Ges");
  assert.equal(m.short_name, "Prime Ges");
  assert.equal(m.start_url, "/app");
  assert.equal(m.scope, "/");
  assert.equal(m.display, "standalone");
  assert.equal(m.lang, "pt-BR");
  assert.equal(m.background_color, "#111820");
  assert.equal(m.theme_color, "#111820");
});

test("manifesto: ícones 192 e 512 comuns e 512 maskable, todos existem com o tamanho declarado", () => {
  const m = manifest();
  const byPurpose = (purpose) => m.icons.filter((icon) => icon.purpose === purpose);
  assert.ok(byPurpose("any").some((i) => i.sizes === "192x192"));
  assert.ok(byPurpose("any").some((i) => i.sizes === "512x512"));
  assert.ok(byPurpose("maskable").some((i) => i.sizes === "512x512"));
  for (const icon of m.icons) {
    const file = "public" + icon.src;
    assert.ok(existsSync(file), `${file} não existe`);
    const [w, h] = icon.sizes.split("x").map(Number);
    assert.deepEqual(pngSize(file), { width: w, height: h }, file);
  }
});

test("manifesto: atalhos levam para telas reais do app", () => {
  const m = manifest();
  const urls = m.shortcuts.map((s) => s.url);
  for (const url of ["/app/agenda", "/app/vendas/nova", "/app/clientes", "/app/caixa"]) {
    assert.ok(urls.includes(url), url);
    const page = url === "/app/vendas/nova" ? "src/app/(app)/app/vendas/nova/page.tsx" : `src/app/(app)${url}/page.tsx`;
    assert.ok(existsSync(page), `${url} sem página (${page})`);
  }
});

// O app instalável nunca pode virar um jeito de guardar dados de uma pessoa no aparelho.
test("service worker: só trata abertura de página e só guarda a tela offline", () => {
  const sw = read("public/sw.js");
  assert.ok(sw.includes('request.mode !== "navigate"'), "tudo que não é abertura de página passa direto para a rede");
  // a única coisa posta em cache é a página offline
  const puts = sw.match(/cache\.(add|put|addAll)\(/g) ?? [];
  assert.equal(puts.length, 1, "só um ponto grava em cache");
  assert.ok(sw.includes("cache.add(new Request(OFFLINE_URL"));
  assert.ok(!/cache\.put\(/.test(sw), "nunca guarda respostas da rede");
  assert.ok(!/localStorage|indexedDB|sessionStorage/.test(sw));
  assert.ok(sw.includes("self.clients.claim()") && sw.includes("self.skipWaiting()"));
});

test("página offline existe, não é indexada e não pede nada à rede além do ícone", () => {
  const html = read("public/offline.html");
  assert.ok(html.includes('lang="pt-BR"') && html.includes("Você está sem conexão"));
  assert.ok(html.includes('name="robots" content="noindex"'));
  assert.ok(!/<script\s+src=|https?:\/\//.test(html), "sem scripts nem endereços externos");
});

test("cabeçalhos: o service worker nunca fica em cache", () => {
  const config = read("next.config.js");
  assert.ok(config.includes('source: "/sw.js"'));
  assert.ok(config.includes("no-cache, no-store, must-revalidate"));
  assert.ok(config.includes("Service-Worker-Allowed"));
});

test("área logada registra o app e Configurações tem a aba Aplicativo", () => {
  assert.ok(read("src/app/(app)/layout.tsx").includes("<PwaSetup />"));
  const setup = read("src/components/pwa/pwa-setup.tsx");
  assert.ok(setup.includes('register("/sw.js"') && setup.includes('process.env.NODE_ENV !== "production"'));
  assert.ok(read("src/lib/settings/nav.ts").includes("/app/configuracoes/aplicativo"));
  assert.ok(existsSync("src/app/(app)/app/configuracoes/aplicativo/page.tsx"));
  const root = read("src/app/layout.tsx");
  assert.ok(root.includes("themeColor") && root.includes("appleWebApp"));
});

test("instalar: Android usa o pedido do navegador e iPhone mostra o passo a passo", () => {
  const install = read("src/lib/pwa/install.ts");
  assert.ok(install.includes("beforeinstallprompt") && install.includes("appinstalled") && install.includes("display-mode: standalone"));
  const card = read("src/components/pwa/install-app-card.tsx");
  assert.ok(card.includes("Adicionar à Tela de Início") && card.includes("Instalar aplicativo"));
  assert.ok(card.includes("Nenhum dado da sua empresa fica guardado no aparelho"));
});
