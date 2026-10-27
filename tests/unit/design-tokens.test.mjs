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

describe("tema permanece exclusivamente escuro", () => {
  it("o <html> raiz fixa a classe dark e não há alternância de tema", () => {
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

  it("os tokens claros do :root continuam definidos (decisão de tema pendente)", () => {
    const rootBlock = block(css, ":root");
    assert.equal(token(rootBlock, "background"), "0 0% 100%");
    assert.ok(token(rootBlock, "primary"));
  });
});
