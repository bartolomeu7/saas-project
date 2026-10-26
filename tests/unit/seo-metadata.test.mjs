import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * SEO — Etapa 1 (verificações de código-fonte; rodam no CI mesmo sem build).
 * O HTML realmente gerado é conferido em tests/seo/rendered-html.test.mjs (precisa de `next build`).
 */
const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
const appDir = new URL("src/app/", root).pathname.replace(/^\/([A-Za-z]:)/, "$1");

describe("S05 — modelo de títulos e descrições", () => {
  it("o layout raiz define título padrão e modelo com a marca", () => {
    const src = read("src/app/layout.tsx");
    assert.match(src, /title:\s*\{\s*default:\s*siteConfig\.name,\s*template:\s*`%s \| \$\{siteConfig\.name\}`\s*\}/);
  });

  it("a home usa título absoluto (não duplica a marca) e mantém canonical e Open Graph", () => {
    const src = read("src/app/(public)/page.tsx");
    assert.match(src, /const HOME_TITLE = "Prime Ges — Sistema de gestão online para pequenos negócios"/);
    assert.match(src, /title:\s*\{\s*absolute:\s*HOME_TITLE\s*\}/);
    assert.match(src, /alternates:\s*\{\s*canonical:\s*siteConfig\.url\s*\}/);
    assert.match(src, /openGraph:\s*publicOpenGraph\("\/"/);
  });

  it("a descrição global descreve o produto real, sem a frase genérica antiga", () => {
    const src = read("src/config/site.ts");
    const m = src.match(/description:\s*"([^"]+)"/s) ?? src.match(/description:\s*\n\s*"([^"]+)"/);
    assert.ok(m, "descrição encontrada");
    const description = m[1];
    assert.ok(description.length >= 70 && description.length <= 170, "tamanho " + description.length);
    assert.ok(!/SaaS moderna/i.test(description));
    for (const term of ["clientes", "vendas", "caixa", "estoque"]) assert.ok(description.toLowerCase().includes(term), term);
  });

  it("login e cadastro têm descrição própria, diferentes entre si e da global", () => {
    const global = read("src/config/site.ts").match(/description:\s*\n?\s*"([^"]+)"/)[1];
    const get = (p) => read(p).match(/export const metadata[^=]*=\s*\{[^}]*?description:\s*\n?\s*"([^"]+)"/s)?.[1];
    const login = get("src/app/(public)/login/page.tsx");
    const register = get("src/app/(public)/register/page.tsx");
    for (const d of [login, register]) {
      assert.ok(d && d.length >= 60 && d.length <= 200, "descrição presente e de tamanho razoável");
    }
    assert.notEqual(login, register);
    assert.notEqual(login, global);
    assert.notEqual(register, global);
    assert.match(login, /entre|acessar/i);
    assert.match(register, /crie|cadastr|conta/i);
  });

  it("nenhuma página pública define título com a marca (o modelo já a acrescenta)", () => {
    for (const p of [
      "src/app/(public)/login/page.tsx",
      "src/app/(public)/register/page.tsx",
      "src/app/(public)/termos-de-uso/page.tsx",
      "src/app/(public)/politica-de-privacidade/page.tsx",
      "src/app/(public)/politica-de-reembolso/page.tsx",
      "src/app/(public)/direitos-do-titular/page.tsx",
    ]) {
      const title = read(p).match(/export const metadata[^=]*=\s*\{\s*title:\s*"([^"]+)"/s)?.[1];
      assert.ok(title, p);
      assert.ok(!/prime ges/i.test(title), p + " não deve repetir a marca: " + title);
    }
  });
});

describe("S14 — noindex nas áreas privadas", () => {
  const NOINDEX = /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/;

  it("o layout do grupo (app) e a página de onboarding declaram noindex, nofollow", () => {
    assert.match(read("src/app/(app)/layout.tsx"), NOINDEX);
    assert.match(read("src/app/onboarding/page.tsx"), NOINDEX);
  });

  it("o painel administrativo e as telas de sessão continuam com noindex", () => {
    for (const p of ["src/app/admin/layout.tsx", "src/app/aceite-termos/page.tsx", "src/app/acesso-indisponivel/page.tsx", "src/app/acesso-sessoes/page.tsx"]) {
      assert.match(read(p), NOINDEX, p);
    }
  });

  it("nenhuma página/layout dentro de (app) ou admin sobrescreve `robots` (herdariam index permitido)", () => {
    const offenders = walk(join(appDir, "(app)"))
      .filter((f) => /(page|layout)\.tsx$/.test(f) && !f.endsWith("(app)\\layout.tsx") && !f.endsWith("(app)/layout.tsx"))
      .filter((f) => /robots\s*:/.test(readFileSync(f, "utf8")));
    assert.deepEqual(offenders, []);
  });

  it("as páginas públicas indexáveis não têm noindex", () => {
    for (const p of [
      "src/app/(public)/page.tsx",
      "src/app/(public)/termos-de-uso/page.tsx",
      "src/app/(public)/politica-de-privacidade/page.tsx",
      "src/app/(public)/politica-de-reembolso/page.tsx",
      "src/app/(public)/direitos-do-titular/page.tsx",
    ]) {
      assert.ok(!/robots\s*:/.test(read(p)), p + " não deve definir robots");
    }
    assert.ok(!/robots\s*:/.test(read("src/app/layout.tsx")), "o layout raiz não pode ter noindex global");
  });

  it("login, cadastro e conta-excluída não são mais bloqueados no robots.txt (estratégia da Etapa 3: rastreável + noindex)", () => {
    const list = (read("src/app/robots.ts").match(/disallow:\s*\[([^\]]*)\]/)?.[1] ?? "").match(/"([^"]+)"/g)?.map((x) => x.slice(1, -1)) ?? [];
    assert.ok(list.length > 5, "lista de Disallow lida");
    for (const path of ["/login", "/register", "/conta-excluida"]) assert.ok(!list.includes(path), path);
  });
});

describe("S01 — FAQ renderizado no servidor", () => {
  it("as respostas usam forceMount e o componente as esconde só por CSS", () => {
    assert.match(read("src/app/(public)/page.tsx"), /<AccordionContent forceMount /);
    const acc = read("src/components/ui/accordion.tsx");
    assert.match(acc, /props\.forceMount && "data-\[state=closed\]:hidden"/);
  });

  it("o FAQ mantém as 9 perguntas originais e tem 1 nova (para quem é indicado), todas únicas", () => {
    const questions = [...read("src/config/marketing.ts").matchAll(/question:\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.equal(questions.length, 10);
    assert.equal(new Set(questions).size, 10);
    for (const original of ["O que é o Prime Ges?", "Preciso instalar algum programa?", "Como funciona o teste grátis?", "Como é feito o pagamento?", "O que acontece quando o período do plano termina?", "Posso ter outras pessoas usando a minha empresa?", "Os dados da minha empresa ficam separados dos de outras?", "Há suporte?", "Onde leio os Termos de Uso e a Política de Privacidade?"]) {
      assert.ok(questions.includes(original), original);
    }
  });
});

/** Dimensões lidas direto do cabeçalho dos arquivos (sem dependências). */
function pngSize(file) {
  const b = readFileSync(new URL(file, root));
  assert.equal(b.subarray(1, 4).toString("latin1"), "PNG", file + " não é PNG");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), bytes: b.length };
}
function jpegSize(file) {
  const b = readFileSync(new URL(file, root));
  assert.ok(b[0] === 0xff && b[1] === 0xd8, file + " não é JPEG");
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5), bytes: b.length };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error("SOF não encontrado em " + file);
}

describe("S03 — imagem de compartilhamento (Open Graph / Twitter)", () => {
  it("o arquivo é um JPEG 1200×630 com menos de 300 KB", () => {
    const { width, height, bytes } = jpegSize("public/og-primeges-1200x630.jpg");
    assert.equal(width, 1200);
    assert.equal(height, 630);
    assert.ok(bytes < 300 * 1024, "peso " + bytes);
  });

  it("a configuração central descreve a mesma imagem (URL relativa, dimensões, tipo e texto alternativo)", () => {
    const src = read("src/config/site.ts");
    assert.match(src, /export const ogImage = \{/);
    assert.match(src, /url:\s*"\/og-primeges-1200x630\.jpg"/);
    assert.match(src, /width:\s*1200/);
    assert.match(src, /height:\s*630/);
    assert.match(src, /type:\s*"image\/jpeg"/);
    const alt = src.match(/alt:\s*"([^"]+)"/)?.[1] ?? "";
    assert.ok(alt.length >= 60 && alt.includes("Prime Ges"), "alt descritivo");
    assert.ok(!/localhost|https?:\/\//.test(src.slice(src.indexOf("export const ogImage"))), "URL da imagem não pode fixar domínio");
  });

  it("o layout raiz herda Open Graph e Twitter com a imagem; a home repete a imagem (o Next substitui o objeto openGraph)", () => {
    const layout = read("src/app/layout.tsx");
    assert.match(layout, /openGraph:\s*\{[^}]*images:\s*\[ogImage\]/);
    assert.match(layout, /twitter:\s*\{\s*card:\s*"summary_large_image",\s*images:\s*\[ogImage\]/);
    // a home (e as páginas legais) usam publicOpenGraph(), que inclui `images: [ogImage]` (ver seo-indexing.test.mjs)
    assert.match(read("src/config/site.ts"), /images:\s*\[ogImage\]/);
  });

  it("não há segunda fonte de imagem (convenção opengraph-image/twitter-image) duplicando a configuração", () => {
    const names = readdirSync(new URL("src/app/", root));
    assert.deepEqual(names.filter((n) => /^(opengraph|twitter)-image/.test(n)), []);
  });
});

describe("S10 — ícones e logotipo", () => {
  it("favicon PNG: quadrado, múltiplo de 48 px e com até 20 KB", () => {
    const { width, height, bytes } = pngSize("src/app/icon.png");
    assert.equal(width, height);
    assert.equal(width % 48, 0);
    assert.ok(bytes <= 20 * 1024, "peso " + bytes);
  });

  it("apple-icon tem 180×180 e favicon.ico existe e é leve", () => {
    const apple = pngSize("src/app/apple-icon.png");
    assert.equal(apple.width, 180);
    assert.equal(apple.height, 180);
    const ico = readFileSync(new URL("src/app/favicon.ico", root));
    assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0], "cabeçalho ICO");
    assert.ok(ico.length < 20 * 1024);
  });

  it("o logotipo compartilhado (public/logo.png) foi reduzido sem mudar o enquadramento (quadrado, transparente)", () => {
    const { width, height, bytes } = pngSize("public/logo.png");
    assert.equal(width, height);
    assert.ok(width >= 256 && width <= 1254, "dimensão " + width);
    assert.ok(bytes < 150 * 1024, "peso " + bytes);
    const colorType = readFileSync(new URL("public/logo.png", root))[25];
    assert.equal(colorType, 6, "RGBA preservado (transparência)");
  });
});
