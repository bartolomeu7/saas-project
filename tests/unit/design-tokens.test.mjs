import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Design system — Onda 0: os tokens de cor que sustentam o botão primário, o item ativo da sidebar, o badge "info" e as
 * superfícies flutuantes (dropdown, popover, select, tooltip, command) ficam em UM lugar (globals.css + tailwind.config.ts)
 * e o tema continua exclusivamente escuro. Teste estático: lê os arquivos-fonte; não abre navegador nem chama serviços.
 */
const base = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, base), "utf8");

const css = read("src/app/globals.css");
const tailwind = read("tailwind.config.ts");

/** Corpo de um bloco `selector { ... }` (primeira ocorrência). */
function block(source, selector) {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `bloco ${selector} não encontrado`);
  const end = source.indexOf("\n  }", start);
  return source.slice(start, end);
}
const token = (body, name) => new RegExp(`--${name}:\\s*([^;]+);`).exec(body)?.[1].trim();

describe("tokens de cor da fundação (Onda 0)", () => {
  const rootBlock = block(css, ":root");
  const darkBlock = block(css, ".dark");

  it("define popover, primary-solid, primary-solid-hover e primary-text no tema escuro e no :root", () => {
    for (const [label, body] of [[":root", rootBlock], [".dark", darkBlock]]) {
      for (const name of ["popover", "popover-foreground", "primary-solid", "primary-solid-hover", "primary-text"]) {
        assert.ok(token(body, name), `--${name} ausente em ${label}`);
      }
    }
  });

  it("preserva os valores que antes estavam fixos no JSX (nenhuma mudança visual)", () => {
    assert.equal(token(darkBlock, "primary-solid"), "211 89% 44%");
    assert.equal(token(darkBlock, "primary-solid-hover"), "211 89% 39%");
    assert.equal(token(darkBlock, "primary-text"), "207 100% 68%");
    // O :root (tema claro dormente) mantém o mesmo botão de hoje, que nunca dependeu do tema.
    assert.equal(token(rootBlock, "primary-solid"), "211 89% 44%");
  });

  it("não altera o azul de marca nem as superfícies que já existiam", () => {
    assert.equal(token(darkBlock, "primary"), "207 100% 54%");
    assert.equal(token(darkBlock, "ring"), "207 100% 54%");
    assert.equal(token(darkBlock, "card"), "211 31% 13%");
    assert.equal(token(darkBlock, "popover"), token(darkBlock, "card"));
  });

  it("o Tailwind expõe os tokens como classes (bg-popover, bg-primary-solid, text-primary-text…)", () => {
    assert.match(tailwind, /popover:\s*\{[^}]*--popover\) \/ <alpha-value>[^}]*--popover-foreground\)/s);
    assert.match(tailwind, /solid:\s*'hsl\(var\(--primary-solid\) \/ <alpha-value>\)'/);
    assert.match(tailwind, /'solid-hover':\s*'hsl\(var\(--primary-solid-hover\) \/ <alpha-value>\)'/);
    assert.match(tailwind, /text:\s*'hsl\(var\(--primary-text\) \/ <alpha-value>\)'/);
  });
});

describe("consumidores dos tokens (sem HSL arbitrário nos componentes de fundação)", () => {
  it("Button default usa os tokens", () => {
    const button = read("src/components/ui/button.tsx");
    assert.match(button, /bg-primary-solid text-white shadow-soft hover:bg-primary-solid-hover/);
    assert.doesNotMatch(button, /hsl\(/);
  });

  it("sidebar da empresa e badge info usam text-primary-text", () => {
    assert.match(read("src/components/app/app-sidebar.tsx"), /data-\[active=true\]:text-primary-text/);
    assert.doesNotMatch(read("src/components/app/app-sidebar.tsx"), /hsl\(/);
    assert.match(read("src/components/ui/badge.tsx"), /info:.*text-primary-text/);
    assert.doesNotMatch(read("src/components/ui/badge.tsx"), /hsl\(/);
  });
});

describe("tema: escuro por padrão em todo o site; claro só opcional na área logada", () => {
  it("o <html> raiz fixa a classe dark (páginas públicas nunca ficam claras) e não há biblioteca de tema", () => {
    const layout = read("src/app/layout.tsx");
    assert.match(layout, /<html[^>]*className=\{`dark /);
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.equal(deps["next-themes"], undefined);
    assert.equal(deps["tailwindcss"].startsWith("^3."), true);
    assert.equal(deps["react"].startsWith("^18."), true);
    assert.equal(deps["zod"].startsWith("^3."), true);
    assert.equal(Object.keys(deps).some((n) => n.startsWith("@base-ui")), false);
  });

  it("o tema claro opcional tem paleta própria no :root, com contraste suficiente", () => {
    const rootBlock = block(css, ":root");
    // converte "H S% L%" em luminância relativa (WCAG)
    const lum = (hsl) => {
      const [h, s, l] = hsl.replace(/%/g, "").split(/\s+/).map(Number);
      const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
      const f = (n) => {
        const k = (n + h / 30) % 12;
        return l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
      };
      const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * lin(f(0)) + 0.7152 * lin(f(8)) + 0.0722 * lin(f(4));
    };
    const ratio = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const t = (name) => token(rootBlock, name);
    const card = t("card");
    const bg = t("background");
    // texto de corpo e texto secundário sobre as superfícies claras
    for (const [fg, surface] of [["foreground", "background"], ["foreground", "card"], ["muted-foreground", "card"], ["muted-foreground", "background"], ["muted-foreground", "muted"], ["primary-text", "card"], ["primary-text", "background"], ["destructive", "card"], ["success", "card"], ["warning", "card"]]) {
      assert.ok(ratio(t(fg), t(surface)) >= 4.5, `--${fg} sobre --${surface} abaixo de 4,5:1 (${ratio(t(fg), t(surface)).toFixed(2)})`);
    }
    // texto branco sobre o botão primário sólido e sobre o destrutivo
    assert.ok(ratio("0 0% 100%", t("primary-solid")) >= 4.5, "texto branco sobre --primary-solid");
    // borda de campo (WCAG 1.4.11): ≥ 3:1 sobre o cartão e sobre o fundo
    assert.ok(ratio(t("input"), card) >= 3, "--input sobre --card");
    assert.ok(ratio(t("input"), bg) >= 3, "--input sobre --background");
    // o cartão se distingue do fundo da página
    assert.notEqual(card, bg);
  });
});
