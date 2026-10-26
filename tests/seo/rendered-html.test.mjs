import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * SEO — verificação do HTML REALMENTE GERADO (não do código-fonte).
 *
 * Como rodar (depois de `npm run build`):
 *   node --no-warnings --test tests/seo/rendered-html.test.mjs
 * Para também conferir as rotas dinâmicas públicas, suba `npm run start` (porta 3100) e rode com
 *   SEO_BASE_URL=http://localhost:3100 node --no-warnings --test tests/seo/rendered-html.test.mjs
 * Sem build ou sem SEO_BASE_URL, os grupos correspondentes são PULADOS (nunca "passam" em silêncio).
 */
const root = new URL("../../", import.meta.url);
const built = (name) => new URL(`.next/server/app/${name}`, root);
const hasBuild = existsSync(built("index.html"));
const BASE = process.env.SEO_BASE_URL?.replace(/\/$/, "");

const text = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
const one = (html, re) => (html.match(re) ?? [])[1];
const all = (html, re) => [...html.matchAll(re)].map((m) => m[1]);

const marketing = readFileSync(new URL("src/config/marketing.ts", root), "utf8");
const QUESTIONS = all(marketing, /question:\s*"([^"]+)"/g);

describe("FAQ da home (S01) — HTML gerado", { skip: !hasBuild && "rode `npm run build` antes" }, () => {
  const html = hasBuild ? readFileSync(built("index.html"), "utf8") : "";
  const faq = one(html, /<section[^>]*id="faq"[^>]*>([\s\S]*?)<\/section>/) ?? "";

  it("a fonte tem 10 perguntas e todas aparecem no HTML, na ordem", () => {
    assert.equal(QUESTIONS.length, 10);
    const buttons = [...faq.matchAll(/<button[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => ({ id: m[1], q: text(m[2]) }));
    assert.deepEqual(buttons.map((b) => b.q), QUESTIONS);
  });

  it("cada pergunta tem a sua resposta no HTML inicial (região ligada pelo aria-labelledby, texto não vazio)", () => {
    const buttons = [...faq.matchAll(/<button[^>]*id="([^"]+)"[^>]*>/g)].map((m) => m[1]);
    assert.equal(buttons.length, QUESTIONS.length);
    const regions = [...faq.matchAll(/<div[^>]*role="region"[^>]*aria-labelledby="([^"]+)"[^>]*>([\s\S]*?)<\/div><\/div>/g)];
    assert.equal(regions.length, QUESTIONS.length, "uma região de resposta por pergunta no HTML");
    for (const [index, id] of buttons.entries()) {
      const region = regions.find((r) => r[1] === id);
      assert.ok(region, "resposta ligada à pergunta " + (index + 1));
      const answer = text(region[2]);
      assert.ok(answer.length >= 25, `resposta ${index + 1} vazia ou curta: "${answer}"`);
      assert.notEqual(answer, QUESTIONS[index]);
    }
  });

  it("as respostas fechadas ficam escondidas por CSS (data-state=closed + hidden), não removidas", () => {
    const regions = [...faq.matchAll(/<div[^>]*role="region"[^>]*>/g)].map((m) => m[0]);
    assert.equal(regions.length, QUESTIONS.length);
    for (const tag of regions) {
      assert.match(tag, /data-state="closed"/);
      assert.match(tag, /data-\[state=closed\]:hidden/);
    }
  });
});

describe("Títulos e descrições (S05) — páginas estáticas geradas", { skip: !hasBuild && "rode `npm run build` antes" }, () => {
  const pages = {
    home: ["index.html", "Prime Ges — Sistema de gestão online para pequenos negócios"],
    "termos-de-uso": ["termos-de-uso.html", "Termos de Uso | Prime Ges"],
    "politica-de-privacidade": ["politica-de-privacidade.html", "Política de Privacidade | Prime Ges"],
    "politica-de-reembolso": ["politica-de-reembolso.html", "Política de Reembolso e Cancelamento | Prime Ges"],
    "direitos-do-titular": ["direitos-do-titular.html", "Direitos do Titular de Dados | Prime Ges"],
  };
  const docs = Object.fromEntries(
    Object.entries(pages).map(([k, [file]]) => [k, hasBuild && existsSync(built(file)) ? readFileSync(built(file), "utf8") : ""]),
  );

  it("cada página tem exatamente um <title> com o texto esperado (marca presente, sem duplicar)", () => {
    for (const [key, [, expected]] of Object.entries(pages)) {
      const titles = all(docs[key], /<title>([\s\S]*?)<\/title>/g);
      assert.deepEqual(titles, [expected], key);
      assert.ok((titles[0].match(/Prime Ges/g) ?? []).length === 1, key + ": marca uma única vez");
    }
  });

  it("cada página tem uma descrição própria (e nenhuma repete a outra)", () => {
    const descriptions = Object.entries(docs).map(([key, html]) => {
      const list = all(html, /<meta name="description" content="([^"]*)"/g);
      assert.equal(list.length, 1, key + ": exatamente uma meta description");
      assert.ok(list[0].length >= 60 && list[0].length <= 200, key + " tamanho " + list[0].length);
      return list[0];
    });
    assert.equal(new Set(descriptions).size, descriptions.length);
    assert.ok(!descriptions.some((d) => /SaaS moderna/i.test(d)));
  });

  it("páginas públicas indexáveis não têm noindex, têm canonical e <html lang=pt-BR>", () => {
    for (const [key, html] of Object.entries(docs)) {
      assert.ok(!/<meta name="robots"[^>]*noindex/i.test(html), key + ": sem noindex");
      assert.equal(all(html, /<link rel="canonical" href="([^"]+)"/g).length, 1, key + ": um canonical");
      assert.match(html, /<html[^>]*lang="pt-BR"/);
    }
  });

  it("a home mantém um único H1 e as metatags Open Graph", () => {
    assert.equal((docs.home.match(/<h1[\s>]/g) ?? []).length, 1);
    assert.match(docs.home, /property="og:title"/);
  });
});

describe("Compartilhamento (S03) e ícones (S10) — HTML gerado", { skip: !hasBuild && "rode `npm run build` antes" }, () => {
  const files = {
    home: "index.html",
    "termos-de-uso": "termos-de-uso.html",
    "politica-de-privacidade": "politica-de-privacidade.html",
    "politica-de-reembolso": "politica-de-reembolso.html",
    "direitos-do-titular": "direitos-do-titular.html",
  };
  const docs = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, hasBuild ? readFileSync(built(f), "utf8") : ""]));
  const metas = (html) => [...html.matchAll(/<meta (?:property|name)="((?:og|twitter):[^"]+)" content="([^"]*)"/g)].map((m) => [m[1], m[2]]);
  const value = (html, key) => metas(html).filter(([k]) => k === key).map(([, v]) => v);
  const IMAGE_PATH = "/og-primeges-1200x630.jpg";

  it("todas as páginas públicas têm og:image e twitter:image absolutos, iguais, com dimensões e texto alternativo", () => {
    for (const [key, html] of Object.entries(docs)) {
      const og = value(html, "og:image");
      const tw = value(html, "twitter:image");
      assert.equal(og.length, 1, key + ": um og:image");
      assert.equal(tw.length, 1, key + ": um twitter:image");
      assert.match(og[0], /^https?:\/\/[^/]+\/og-primeges-1200x630\.jpg/, key + ": URL absoluta");
      assert.equal(og[0], tw[0], key + ": og:image e twitter:image iguais");
      assert.deepEqual(value(html, "og:image:width"), ["1200"], key);
      assert.deepEqual(value(html, "og:image:height"), ["630"], key);
      assert.ok((value(html, "og:image:alt")[0] ?? "").length >= 60, key + ": og:image:alt");
      assert.deepEqual(value(html, "twitter:card"), ["summary_large_image"], key);
    }
  });

  it("a origem da imagem é a mesma do canonical (nada de domínio alternativo) e, se SEO_EXPECT_ORIGIN estiver definido, é a esperada", () => {
    for (const [key, html] of Object.entries(docs)) {
      const canonical = all(html, /<link rel="canonical" href="([^"]+)"/g)[0];
      assert.equal(new URL(value(html, "og:image")[0]).origin, new URL(canonical).origin, key);
      if (process.env.SEO_EXPECT_ORIGIN) {
        assert.equal(new URL(canonical).origin, process.env.SEO_EXPECT_ORIGIN, key + ": origem esperada");
        assert.ok(!/localhost/.test(html.replace(/<script[\s\S]*?<\/script>/g, "")), key + ": sem localhost no HTML");
      }
    }
  });

  it("nenhuma metatag og:/twitter: se repete e og:title/og:description coincidem com title/description", () => {
    for (const [key, html] of Object.entries(docs)) {
      const keys = metas(html).map(([k]) => k).filter((k) => !/^og:image:|^twitter:image:/.test(k));
      assert.equal(new Set(keys).size, keys.length, key + ": metatags duplicadas: " + keys.join(","));
      const title = all(html, /<title>([\s\S]*?)<\/title>/g)[0];
      const description = all(html, /<meta name="description" content="([^"]*)"/g)[0];
      assert.deepEqual(value(html, "og:title"), [title], key);
      assert.deepEqual(value(html, "og:description"), [description], key);
      assert.deepEqual(value(html, "twitter:title"), [title], key);
    }
  });

  it("home e páginas legais têm og:url igual ao canonical (mesma origem da imagem)", () => {
    for (const [key, html] of Object.entries(docs)) {
      const canonical = all(html, /<link rel="canonical" href="([^"]+)"/g)[0];
      assert.deepEqual(value(html, "og:url"), [canonical], key);
      assert.equal(new URL(value(html, "og:image")[0]).origin, new URL(canonical).origin, key);
    }
  });

  it("o HTML referencia favicon.ico, icon.png (múltiplo de 48) e apple-touch-icon 180×180, e os arquivos existem no build", () => {
    for (const [key, html] of Object.entries(docs)) {
      const links = [...html.matchAll(/<link rel="(icon|apple-touch-icon)" href="([^"?]+)[^"]*"[^>]*sizes="(\d+)x\d+"/g)].map((m) => ({ rel: m[1], href: m[2], size: Number(m[3]) }));
      const hrefs = links.map((l) => l.href).sort();
      assert.deepEqual(hrefs, ["/apple-icon.png", "/favicon.ico", "/icon.png"], key);
      assert.equal(links.find((l) => l.href === "/icon.png").size % 48, 0, key + ": icon.png múltiplo de 48");
      assert.equal(links.find((l) => l.href === "/apple-icon.png").size, 180, key);
      for (const l of links) assert.ok(existsSync(built(l.href.slice(1) + ".body")), key + ": arquivo gerado para " + l.href);
    }
    assert.ok(existsSync(new URL("public/og-primeges-1200x630.jpg", root)));
  });
});

describe("Home — título, descrição, H1, hierarquia e links (Etapa 4) — HTML gerado", { skip: !hasBuild && "rode `npm run build` antes" }, () => {
  const html = hasBuild ? readFileSync(built("index.html"), "utf8") : "";
  const source = readFileSync(new URL("src/app/(public)/page.tsx", root), "utf8");
  const EXPECTED_TITLE = source.match(/const HOME_TITLE = "([^"]+)"/)[1];
  const EXPECTED_DESCRIPTION = source.match(/const SEO_DESCRIPTION =\s*"([^"]+)"/)[1];
  const headings = [...html.matchAll(/<h([1-6])[\s>][\s\S]*?<\/h\1>/g)].map((m) => ({ level: Number(m[1]), text: text(m[0]) }));
  const visible = text(html.replace(/<footer[\s\S]*?<\/footer>/, ""));
  // Textos dos planos vêm do catálogo (administrado em /admin/plans), não do código da home: ficam fora da checagem de
  // promessas abaixo e entram na revisão comercial (ver relatório da Etapa 4).
  const visibleWithoutPlans = text(html.replace(/<footer[\s\S]*?<\/footer>/, "").replace(/<section[^>]*id="precos"[\s\S]*?<\/section>/, ""));

  it("title, description e og:* da home são os da Etapa 4, coerentes entre si", () => {
    assert.deepEqual(all(html, /<title>([\s\S]*?)<\/title>/g), [EXPECTED_TITLE]);
    assert.deepEqual(all(html, /<meta name="description" content="([^"]*)"/g), [EXPECTED_DESCRIPTION]);
    assert.deepEqual(all(html, /<meta property="og:title" content="([^"]*)"/g), [EXPECTED_TITLE]);
    assert.deepEqual(all(html, /<meta property="og:description" content="([^"]*)"/g), [EXPECTED_DESCRIPTION]);
    assert.deepEqual(all(html, /<meta name="twitter:title" content="([^"]*)"/g), [EXPECTED_TITLE]);
    assert.ok(EXPECTED_TITLE.length <= 65 && EXPECTED_DESCRIPTION.length >= 110 && EXPECTED_DESCRIPTION.length <= 170);
    assert.match(EXPECTED_TITLE, /Sistema de gestão online para pequenos negócios/);
  });

  it("um único H1, com a proposta de valor, e hierarquia sem saltos (h1 → h2 → h3)", () => {
    const h1s = headings.filter((h) => h.level === 1);
    assert.equal(h1s.length, 1);
    assert.match(h1s[0].text, /^Sistema de gestão para pequenos negócios,\s*da venda ao caixa, em um só lugar\.$/);
    assert.equal(headings[0].level, 1);
    for (let i = 1; i < headings.length; i++) {
      assert.ok(headings[i].level <= headings[i - 1].level + 1, `salto de h${headings[i - 1].level} para h${headings[i].level}: "${headings[i].text}"`);
    }
    for (const h of headings) assert.ok(h.text.length >= 8, "título descritivo: " + h.text);
  });

  it("os títulos H2 descrevem assuntos reais da página", () => {
    const h2 = headings.filter((h) => h.level === 2).map((h) => h.text);
    for (const expected of ["Controle de vendas, caixa, estoque e financeiro no mesmo lugar.", "Sistema para pequenos negócios que vendem produtos, prestam serviços ou os dois.", "Escolha o período que faz sentido para o seu negócio.", "O que você precisa saber antes de começar."]) {
      assert.ok(h2.includes(expected), expected);
    }
  });

  it("links internos: âncoras apontam para ids existentes e as páginas internas são rotas públicas conhecidas", () => {
    const hrefs = [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
    const anchors = hrefs.filter((h) => /^(\/)?#[\w-]+$/.test(h)).map((h) => h.replace(/^\//, "").slice(1));
    assert.ok(new Set(anchors).size >= 6, "âncoras distintas: " + [...new Set(anchors)].join(","));
    for (const id of new Set(anchors)) assert.ok(html.includes(`id="${id}"`), "id ausente: " + id);
    const KNOWN = new Set(["/login", "/register", "/termos-de-uso", "/politica-de-privacidade", "/politica-de-reembolso", "/direitos-do-titular"]);
    for (const h of hrefs.filter((x) => x.startsWith("/") && !x.startsWith("/#") && !x.startsWith("/_next") && !/\.(png|ico|jpg|svg)/.test(x))) assert.ok(KNOWN.has(h), "rota interna desconhecida: " + h);
    for (const must of ["#precos", "#recursos", "#como-funciona", "/register", "/politica-de-reembolso", "/termos-de-uso", "/politica-de-privacidade", "/direitos-do-titular"]) {
      assert.ok(hrefs.some((h) => h === must || h === "/" + must), "link ausente: " + must);
    }
  });

  it("as chamadas para ação existentes continuam e a seção de planos continua lendo o catálogo (sem preço escrito no texto)", () => {
    for (const label of ["Criar conta", "Ver como funciona", "Ver planos e preços", "Entrar"]) assert.ok(visible.includes(label), label);
    assert.ok(!/R\$\s*\d/.test(source.replace(/\/\*[\s\S]*?\*\//g, "")), "sem preço fixo no código da home");
  });

  it("nenhum texto da home promete o que o produto não faz (veículo/placa, integrações, resultados, nota fiscal só como negação)", () => {
    for (const re of [/ve[íi]culos?\b/i, /\bplaca\b/i, /integra[çc][ãa]o|integrado com/i, /aumente (o )?(seu )?(faturamento|lucro)|garantid[oa]|menor pre[çc]o|mais barato/i, /depoimentos?|avalia[çc][õo]es/i]) {
      assert.ok(!re.test(visibleWithoutPlans), "texto proibido no HTML: " + re);
    }
    const sentences = visibleWithoutPlans.split(/(?<=[.!?])\s+/).filter((x) => /nota fiscal|NF-?e|documentos? fiscais?/i.test(x));
    for (const sentence of sentences) assert.match(sentence, /não (emite|substitui)/i);
  });

  it("os segmentos e módulos esperados aparecem no HTML", () => {
    for (const term of ["Padarias", "Mercadinhos e mercearias", "Restaurantes", "Lanchonetes", "Lava-rápidos", "Estética automotiva", "MEI", "microempresas"]) assert.ok(visible.includes(term), term);
    for (const moduleName of ["Clientes", "Produtos", "Serviços", "Vendas", "Fidelidade", "Caixa", "Estoque", "Financeiro"]) assert.ok(visible.includes(moduleName), moduleName);
  });
});

const LD_RE = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
const ldBlocks = (html) => [...html.matchAll(LD_RE)].map((m) => m[1]);

describe("Dados estruturados JSON-LD (Etapa 5) — HTML gerado", { skip: !hasBuild && "rode `npm run build` antes" }, () => {
  const read = (file) => (hasBuild && existsSync(built(file)) ? readFileSync(built(file), "utf8") : "");
  const home = read("index.html");
  const blocks = ldBlocks(home);
  const data = blocks.length === 1 ? JSON.parse(blocks[0]) : null;
  const nodes = data?.["@graph"] ?? [];
  const byType = Object.fromEntries(nodes.map((n) => [n["@type"], n]));
  const canonical = all(home, /<link rel="canonical" href="([^"]+)"/g)[0];
  const origin = canonical ? new URL(canonical).origin : "";
  const metaDescription = all(home, /<meta name="description" content="([^"]*)"/g)[0];

  const keysOf = (value, out = new Set()) => {
    if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) (out.add(k), keysOf(v, out));
    return out;
  };

  it("a home tem exatamente 1 bloco JSON-LD, sintaticamente válido e analisável", () => {
    assert.equal(blocks.length, 1, "um único <script type=application/ld+json>");
    assert.doesNotThrow(() => JSON.parse(blocks[0]));
    assert.equal(data["@context"], "https://schema.org");
    assert.ok(Array.isArray(data["@graph"]));
  });

  it("o conteúdo do script não tem < > & crus (nada consegue fechar a tag)", () => {
    assert.ok(!/[<>&]/.test(blocks[0]));
  });

  it("os tipos são Organization, WebSite e SoftwareApplication, uma vez cada, com @id únicos", () => {
    assert.deepEqual(nodes.map((n) => n["@type"]).sort(), ["Organization", "SoftwareApplication", "WebSite"]);
    const ids = nodes.map((n) => n["@id"]);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(ids.map((id) => id.replace(origin, "")).sort(), ["/#organization", "/#software", "/#website"]);
  });

  it("nomes, URLs e descrição coerentes com o conteúdo público (canonical, meta description, módulos visíveis)", () => {
    for (const node of nodes) if (node.url) assert.equal(node.url, canonical, node["@type"] + ": url = canonical");
    assert.equal(byType.Organization.name, "Prime Ges");
    assert.equal(byType.WebSite.name, "Prime Ges");
    assert.equal(byType.SoftwareApplication.name, "Prime Ges");
    assert.equal(byType.SoftwareApplication.description, metaDescription);
    assert.equal(byType.SoftwareApplication.applicationCategory, "BusinessApplication");
    assert.equal(byType.WebSite.inLanguage, "pt-BR");
    const visible = text(home.replace(/<script[\s\S]*?<\/script>/g, ""));
    for (const feature of byType.SoftwareApplication.featureList) assert.ok(visible.includes(feature), "módulo exibido na home: " + feature);
    assert.equal(byType.SoftwareApplication.featureList.length, 8);
  });

  it("referências entre objetos apontam para entidades existentes (publisher, isPartOf)", () => {
    const ids = new Set(nodes.map((n) => n["@id"]));
    assert.ok(ids.has(byType.WebSite.publisher["@id"]));
    assert.ok(ids.has(byType.SoftwareApplication.publisher["@id"]));
    assert.ok(ids.has(byType.SoftwareApplication.isPartOf["@id"]));
  });

  it("sem localhost/preview (com SEO_EXPECT_ORIGIN, a origem é exatamente a esperada) e com URLs absolutas", () => {
    assert.ok(!/vercel\.app/.test(blocks[0]));
    if (process.env.SEO_EXPECT_ORIGIN) {
      assert.equal(origin, process.env.SEO_EXPECT_ORIGIN);
      assert.ok(!/localhost|127\.0\.0\.1/.test(blocks[0]));
    }
    const urls = [...blocks[0].matchAll(/"(?:url|@id)":"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(urls.length >= 6);
    for (const u of urls) assert.equal(new URL(u).origin, origin, u);
  });

  it("sem propriedades inventadas: nada de preços, ofertas, avaliações, dados da empresa, redes sociais ou busca interna", () => {
    const forbidden = ["offers", "price", "priceCurrency", "aggregateRating", "review", "reviewCount", "ratingValue", "sameAs", "contactPoint", "address", "telephone", "email", "legalName", "taxID", "vatID", "foundingDate", "potentialAction", "screenshot"];
    const keys = keysOf(data);
    for (const key of forbidden) assert.ok(!keys.has(key), "propriedade proibida: " + key);
    assert.ok(!/R\$|BLOCKED|VALIDAÇÃO/.test(blocks[0]), "sem moeda nem marcadores pendentes");
    assert.deepEqual(Object.keys(byType.Organization).sort(), ["@id", "@type", "logo", "name", "url"]);
  });

  it("o logotipo do Organization é o arquivo oficial, existe no build e tem as dimensões declaradas", () => {
    const logo = byType.Organization.logo;
    assert.equal(logo.url, origin + "/logo.png");
    assert.deepEqual([logo.width, logo.height], [512, 512]);
    const file = readFileSync(new URL("public/logo.png", root));
    assert.deepEqual([file.readUInt32BE(16), file.readUInt32BE(20)], [512, 512]);
  });

  it("não há JSON-LD duplicado nem em outras páginas públicas estáticas (legais)", () => {
    for (const file of ["termos-de-uso.html", "politica-de-privacidade.html", "politica-de-reembolso.html", "direitos-do-titular.html"]) {
      assert.equal(ldBlocks(read(file)).length, 0, file);
    }
    assert.equal(ldBlocks(read("_not-found.html")).length, 0);
  });

  it("os metadados, a imagem de compartilhamento e o FAQ das Etapas 1 a 4 seguem na home", () => {
    assert.equal(all(home, /<title>([\s\S]*?)<\/title>/g).length, 1);
    assert.equal(value_(home, "og:image").length, 1);
    assert.equal(value_(home, "og:url")[0], canonical);
    assert.equal((home.match(/role="region"/g) ?? []).length, QUESTIONS.length);
  });
});

function value_(html, key) {
  return [...html.matchAll(/<meta (?:property|name)="((?:og|twitter):[^"]+)" content="([^"]*)"/g)].filter((m) => m[1] === key).map((m) => m[2]);
}

/** Interpretador mínimo de robots.txt (Google: regra mais longa vence; Allow vence empate; suporta * e $). */
function robotsAllows(rules, path) {
  const toRegex = (rule) => {
    const anchored = rule.endsWith("$");
    const body = (anchored ? rule.slice(0, -1) : rule).replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp("^" + body + (anchored ? "$" : ""));
  };
  let best = { len: -1, allow: true };
  for (const { allow, rule } of rules) {
    if (!rule) continue;
    if (toRegex(rule).test(path) && (rule.length > best.len || (rule.length === best.len && allow))) best = { len: rule.length, allow };
  }
  return best.allow;
}

describe("Sitemap e robots.txt (S06/S07) — arquivos gerados", { skip: !hasBuild && "rode `npm run build` antes" }, () => {
  const xml = hasBuild && existsSync(built("sitemap.xml.body")) ? readFileSync(built("sitemap.xml.body"), "utf8") : "";
  const robotsTxt = hasBuild && existsSync(built("robots.txt.body")) ? readFileSync(built("robots.txt.body"), "utf8") : "";
  const home = hasBuild ? readFileSync(built("index.html"), "utf8") : "";
  const origin = new URL(all(home, /<link rel="canonical" href="([^"]+)"/g)[0] ?? "http://x.invalid").origin;
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    loc: (m[1].match(/<loc>([^<]+)<\/loc>/) ?? [])[1],
    lastmod: (m[1].match(/<lastmod>([^<]+)<\/lastmod>/) ?? [])[1],
    other: [...m[1].matchAll(/<(changefreq|priority)>/g)].map((x) => x[1]),
  }));
  const rules = [...robotsTxt.matchAll(/^(Allow|Disallow):\s*(.*)$/gim)].map((m) => ({ allow: /^allow$/i.test(m[1]), rule: m[2].trim() }));
  const LEGAL = {
    "/termos-de-uso": "termos-de-uso.html",
    "/politica-de-privacidade": "politica-de-privacidade.html",
    "/politica-de-reembolso": "politica-de-reembolso.html",
    "/direitos-do-titular": "direitos-do-titular.html",
  };

  it("o sitemap é um XML bem formado (urlset do protocolo sitemaps) com pelo menos a home", () => {
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.equal((xml.match(/<url>/g) ?? []).length, (xml.match(/<\/url>/g) ?? []).length);
    assert.equal((xml.match(/<urlset/g) ?? []).length, 1);
    assert.ok(urls.length >= 1);
    for (const u of urls) {
      assert.ok(u.loc && /^https?:\/\/[^\s<]+$/.test(u.loc), "loc absoluto: " + u.loc);
      assert.deepEqual(u.other, [], "sem changefreq/priority: " + u.loc);
    }
    assert.ok(urls.some((u) => u.loc === origin), "a home está no sitemap");
  });

  it("sem duplicatas, na mesma origem do canonical e, com SEO_EXPECT_ORIGIN, sem localhost/preview", () => {
    const locs = urls.map((u) => u.loc);
    assert.equal(new Set(locs).size, locs.length, "URLs duplicadas");
    for (const loc of locs) {
      assert.equal(new URL(loc).origin, origin, loc);
      assert.ok(!/[?#]/.test(loc), "URL limpa: " + loc);
    }
    if (process.env.SEO_EXPECT_ORIGIN) {
      assert.equal(origin, process.env.SEO_EXPECT_ORIGIN);
      for (const loc of locs) assert.ok(!/localhost|127\.0\.0\.1|\.vercel\.app/.test(loc), loc);
    }
  });

  it("nenhuma rota privada, administrativa, de API, login, cadastro ou conta excluída aparece no sitemap", () => {
    for (const { loc } of urls) {
      const path = new URL(loc).pathname;
      assert.ok(!/^\/(app|admin|onboarding|conta|conta-excluida|api|auth|login|register|aceite-termos|acesso-[^/]*|forgot-password|reset-password)(\/|$)/.test(path), path);
    }
  });

  it("lastmod só aparece com data real (AAAA-MM-DD); a home não tem data confiável e fica sem lastmod", () => {
    for (const u of urls) {
      if (u.lastmod === undefined) continue;
      assert.match(u.lastmod, /^\d{4}-\d{2}-\d{2}$/, u.loc);
      assert.ok(new Date(u.lastmod + "T00:00:00Z").toISOString().startsWith(u.lastmod), u.loc);
    }
    assert.equal(urls.find((u) => u.loc === origin).lastmod, undefined, "home sem lastmod");
    assert.ok(!/<lastmod>[^<]*T\d/.test(xml), "sem data/hora de geração");
  });

  it("páginas legais entram no sitemap SOMENTE sem conteúdo provisório (marcadores [BLOCKED]/[VALIDAÇÃO] no HTML)", () => {
    for (const [path, file] of Object.entries(LEGAL)) {
      const html = readFileSync(built(file), "utf8");
      const provisional = /\[BLOCKED|\[VALIDAÇÃO/.test(html);
      const entry = urls.find((u) => u.loc === origin + path);
      assert.equal(Boolean(entry), !provisional, `${path}: provisório=${provisional}, no sitemap=${Boolean(entry)}`);
      if (entry) assert.match(entry.lastmod ?? "", /^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("robots.txt: declara o sitemap na mesma origem e bloqueia só o que é privado/técnico", () => {
    const sitemapLine = robotsTxt.match(/^Sitemap:\s*(\S+)$/m)?.[1];
    assert.equal(sitemapLine, origin + "/sitemap.xml");
    for (const path of ["/app", "/app/clientes", "/admin", "/admin/plans", "/onboarding", "/conta", "/conta/qualquer", "/api/presence", "/api/webhooks/evopay"]) {
      assert.equal(robotsAllows(rules, path), false, path + " deve estar bloqueado");
    }
    for (const path of ["/", "/termos-de-uso", "/politica-de-privacidade", "/politica-de-reembolso", "/direitos-do-titular", "/login", "/register", "/conta-excluida", "/aceite-termos", "/sitemap.xml"]) {
      assert.equal(robotsAllows(rules, path), true, path + " deve estar liberado");
    }
  });

  it("toda URL do sitemap é rastreável pelo robots.txt (nenhuma contradição)", () => {
    for (const { loc } of urls) assert.equal(robotsAllows(rules, new URL(loc).pathname || "/"), true, loc);
  });

  it("com SEO_EXPECT_ORIGIN definido, o robots.txt não contém localhost", () => {
    if (process.env.SEO_EXPECT_ORIGIN) assert.ok(!/localhost/.test(robotsTxt));
  });
});

describe("Rotas dinâmicas (servidor local) — login, cadastro e noindex", { skip: !BASE && "defina SEO_BASE_URL (ex.: http://localhost:3100) com `npm run start`" }, () => {
  const get = async (path) => {
    const response = await fetch(BASE + path, { redirect: "manual" });
    // Em telas que redirecionam dentro da própria página (ex.: /aceite-termos), o Next já enviou o <head> com os metadados.
    return { status: response.status, location: response.headers.get("location"), html: await response.text() };
  };

  it("/login: título com a marca e descrição específica", async () => {
    const { status, html } = await get("/login");
    assert.equal(status, 200);
    assert.deepEqual(all(html, /<title>([\s\S]*?)<\/title>/g), ["Entrar | Prime Ges"]);
    const [d] = all(html, /<meta name="description" content="([^"]*)"/g);
    assert.match(d, /Entre na sua conta do Prime Ges/);
    assert.ok(!/SaaS moderna/i.test(d));
  });

  it("/register: título com a marca e descrição específica", async () => {
    const { status, html } = await get("/register");
    assert.equal(status, 200);
    assert.deepEqual(all(html, /<title>([\s\S]*?)<\/title>/g), ["Criar conta | Prime Ges"]);
    const [d] = all(html, /<meta name="description" content="([^"]*)"/g);
    assert.match(d, /Crie a sua conta no Prime Ges/);
  });

  it("login, cadastro e conta excluída: noindex, nofollow na meta tag E liberados no robots.txt (o Google consegue ler o noindex)", async () => {
    const robotsTxt = hasBuild ? readFileSync(built("robots.txt.body"), "utf8") : "";
    const rules = [...robotsTxt.matchAll(/^(Allow|Disallow):\s*(.*)$/gim)].map((m) => ({ allow: /^allow$/i.test(m[1]), rule: m[2].trim() }));
    for (const path of ["/login", "/register", "/conta-excluida"]) {
      const { status, html } = await get(path);
      assert.equal(status, 200, path);
      assert.deepEqual(all(html, /<meta name="robots" content="([^"]*)"/g), ["noindex, nofollow"], path);
      assert.equal(robotsAllows(rules, path), true, path + " precisa estar rastreável");
    }
  });

  it("o mecanismo de noindex continua igual nas telas de sessão já existentes", async () => {
    for (const path of ["/aceite-termos", "/acesso-indisponivel"]) {
      const a = await get(path);
      assert.match(a.html, /<meta name="robots" content="noindex, nofollow"/, path);
    }
  });

  it("imagem de compartilhamento e ícones respondem 200 com o tipo certo (nenhuma referência quebrada)", async () => {
    const html = (await get("/")).html;
    const urls = new Set(["/og-primeges-1200x630.jpg", "/favicon.ico", "/icon.png", "/apple-icon.png"]);
    for (const m of html.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="([^"]+)"/g)) urls.add(m[1]);
    for (const m of html.matchAll(/<meta property="og:image" content="https?:\/\/[^/]+([^"]+)"/g)) urls.add(m[1]);
    for (const url of urls) {
      const response = await fetch(BASE + url);
      assert.equal(response.status, 200, url);
      assert.match(response.headers.get("content-type") ?? "", /^image\//, url);
      assert.ok((await response.arrayBuffer()).byteLength > 1000, url + " não vazio");
    }
  });

  it("login, cadastro e conta excluída não têm JSON-LD; o logotipo do Organization responde 200 como imagem", async () => {
    for (const path of ["/login", "/register", "/conta-excluida", "/aceite-termos"]) {
      const { html } = await get(path);
      assert.equal(ldBlocks(html).length, 0, path);
    }
    for (const path of ["/app", "/onboarding", "/admin"]) {
      const response = await fetch(BASE + path, { redirect: "manual" });
      assert.equal(response.status, 307, path);
      assert.ok(!/ld\+json/.test(await response.text()), path);
    }
    const logo = await fetch(BASE + "/logo.png");
    assert.equal(logo.status, 200);
    assert.match(logo.headers.get("content-type") ?? "", /^image\/png/);
  });

  it("anônimo nunca vê /app, /onboarding ou /admin: redireciona para o login (o noindex é só defesa em profundidade)", async () => {
    for (const path of ["/app", "/onboarding", "/admin"]) {
      const { status, location } = await get(path);
      assert.equal(status, 307, path);
      assert.match(location ?? "", /\/login\?next=/);
    }
  });
});
