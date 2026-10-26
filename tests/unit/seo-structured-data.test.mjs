import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildStructuredData, serializeJsonLd, structuredDataIds } from "../../src/lib/seo/structured-data.ts";

/** SEO — Etapa 5: dados estruturados (JSON-LD). Funções puras e verificações do código-fonte. */
const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const BACKSLASH = String.fromCharCode(92);

const INPUT = {
  origin: "https://primeges.com.br",
  name: "Prime Ges",
  description: "Sistema de gestão online para MEI e pequenos negócios.",
  logoPath: "/logo.png",
  logoSize: 512,
  featureNames: ["Clientes", "Produtos", "Serviços", "Vendas", "Fidelidade", "Caixa", "Estoque", "Financeiro"],
};

/** Todas as chaves (em qualquer profundidade) de um objeto JSON. */
function allKeys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

describe("buildStructuredData — conteúdo", () => {
  const graph = buildStructuredData(INPUT);
  const byType = Object.fromEntries(graph["@graph"].map((n) => [n["@type"], n]));

  it("é um único @graph do schema.org com exatamente Organization, WebSite e SoftwareApplication (sem duplicatas)", () => {
    assert.equal(graph["@context"], "https://schema.org");
    assert.deepEqual(graph["@graph"].map((n) => n["@type"]).sort(), ["Organization", "SoftwareApplication", "WebSite"]);
    const ids = graph["@graph"].map((n) => n["@id"]);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("identificadores @id estáveis, na mesma origem, e referências corretas entre os objetos", () => {
    const ids = structuredDataIds("https://primeges.com.br/");
    assert.deepEqual(ids, {
      website: "https://primeges.com.br/#website",
      organization: "https://primeges.com.br/#organization",
      software: "https://primeges.com.br/#software",
    });
    assert.equal(byType.Organization["@id"], ids.organization);
    assert.equal(byType.WebSite["@id"], ids.website);
    assert.equal(byType.SoftwareApplication["@id"], ids.software);
    assert.deepEqual(byType.WebSite.publisher, { "@id": ids.organization });
    assert.deepEqual(byType.SoftwareApplication.publisher, { "@id": ids.organization });
    assert.deepEqual(byType.SoftwareApplication.isPartOf, { "@id": ids.website });
  });

  it("todas as URLs usam a origem recebida (a canônica validada), sem barra final nem domínio alternativo", () => {
    for (const node of graph["@graph"]) if (node.url) assert.equal(node.url, "https://primeges.com.br");
    assert.deepEqual(byType.Organization.logo, { "@type": "ImageObject", url: "https://primeges.com.br/logo.png", width: 512, height: 512 });
    const text = JSON.stringify(graph);
    assert.ok(!/localhost|127\.0\.0\.1|vercel\.app/.test(text));
    const other = buildStructuredData({ ...INPUT, origin: "https://www.exemplo.com.br/" });
    assert.ok(JSON.stringify(other).includes("https://www.exemplo.com.br/#website"));
    assert.ok(!JSON.stringify(other).includes("primeges.com.br"));
  });

  it("Organization é só a MARCA: nome, URL e o arquivo oficial do logotipo", () => {
    assert.deepEqual(Object.keys(byType.Organization).sort(), ["@id", "@type", "logo", "name", "url"]);
    assert.equal(byType.Organization.name, "Prime Ges");
  });

  it("WebSite: nome, URL, idioma e publicadora", () => {
    assert.deepEqual(Object.keys(byType.WebSite).sort(), ["@id", "@type", "inLanguage", "name", "publisher", "url"]);
    assert.equal(byType.WebSite.inLanguage, "pt-BR");
  });

  it("SoftwareApplication: categoria de negócio, aplicação web, descrição da home e lista dos módulos disponíveis", () => {
    const s = byType.SoftwareApplication;
    assert.equal(s.applicationCategory, "BusinessApplication");
    assert.equal(s.operatingSystem, "Web");
    assert.equal(s.inLanguage, "pt-BR");
    assert.equal(s.description, INPUT.description);
    assert.deepEqual(s.featureList, INPUT.featureNames);
    assert.deepEqual(Object.keys(s).sort(), ["@id", "@type", "applicationCategory", "description", "featureList", "inLanguage", "isPartOf", "name", "operatingSystem", "publisher", "url"]);
  });

  it("NÃO contém preços, ofertas, avaliações, dados da empresa, redes sociais nem busca interna", () => {
    const forbidden = [
      "offers", "price", "priceCurrency", "priceSpecification", "lowPrice", "highPrice",
      "aggregateRating", "review", "reviewCount", "ratingValue", "ratingCount", "interactionStatistic", "award",
      "sameAs", "contactPoint", "address", "telephone", "email", "legalName", "taxID", "vatID", "iso6523Code", "foundingDate", "numberOfEmployees",
      "potentialAction", "screenshot", "downloadUrl", "installUrl",
    ];
    const keys = allKeys(graph);
    for (const key of forbidden) assert.ok(!keys.has(key), "propriedade proibida: " + key);
    const text = JSON.stringify(graph);
    assert.ok(!/BLOCKED|VALIDAÇÃO|R\$/.test(text), "sem marcadores pendentes nem moeda");
  });

  it("o resultado é JSON analisável e idêntico depois de serializar e analisar", () => {
    assert.deepEqual(JSON.parse(serializeJsonLd(graph)), graph);
  });
});

describe("serializeJsonLd — segurança dentro de <script>", () => {
  it("escapa <, > e & (um '</script>' no texto não consegue fechar a tag) e os separadores U+2028/U+2029", () => {
    const hostile = "</script><script>alert(1)</script><!-- & " + String.fromCharCode(0x2028) + String.fromCharCode(0x2029);
    const out = serializeJsonLd({ description: hostile });
    assert.ok(!/[<>&]/.test(out), "nenhum <, > ou & cru");
    assert.ok(!out.includes(String.fromCharCode(0x2028)) && !out.includes(String.fromCharCode(0x2029)));
    assert.ok(out.includes(BACKSLASH + "u003c") && out.includes(BACKSLASH + "u003e") && out.includes(BACKSLASH + "u0026"));
    assert.equal(JSON.parse(out).description, hostile, "ida e volta sem perda");
  });

  it("a saída para dados normais não muda o significado (acentos e aspas preservados)", () => {
    const value = { a: 'Gestão "simples" — pequenos negócios', n: 3, t: true, x: null };
    assert.deepEqual(JSON.parse(serializeJsonLd(value)), value);
  });
});

describe("Onde o JSON-LD é usado (código-fonte)", () => {
  const SRC = new URL("src/", root).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const slash = (value) => value.split(BACKSLASH).join("/");
  const rel = (f) => slash(f).replace(slash(SRC), "");
  const files = (dir) => readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
  const sourceFiles = files(SRC).filter((f) => /\.(tsx?|jsx?)$/.test(f));

  it("só a página inicial importa o componente JsonLd; ele não está no layout raiz, em páginas privadas, login ou cadastro", () => {
    const users = sourceFiles.filter((f) => /seo\/json-ld/.test(readFileSync(f, "utf8"))).map(rel);
    assert.deepEqual(users, ["app/(public)/page.tsx"]);
    const scripts = sourceFiles.filter((f) => /<script type="application\/ld\+json" dangerouslySetInnerHTML/.test(readFileSync(f, "utf8"))).map(rel);
    assert.deepEqual(scripts, ["components/seo/json-ld.tsx"]);
  });

  it("a home usa a origem validada, a mesma descrição da meta description e a lista de módulos disponíveis; sem offers", () => {
    const home = read("src/app/(public)/page.tsx");
    assert.match(home, /buildStructuredData\(\{[\s\S]*origin:\s*siteConfig\.url/);
    assert.match(home, /description:\s*SEO_DESCRIPTION/);
    assert.match(home, /featureNames:\s*AVAILABLE_FEATURE_NAMES/);
    assert.match(home, /logoPath:\s*"\/logo\.png"/);
    assert.ok(!/offers|aggregateRating|sameAs/.test(home.replace(/\/\/.*$/gm, "")));
    assert.equal((home.match(/<JsonLd /g) ?? []).length, 1, "um único bloco");
  });

  it("o componente só serializa pelo serializador seguro", () => {
    const component = read("src/components/seo/json-ld.tsx");
    assert.match(component, /__html:\s*serializeJsonLd\(data\)/);
    assert.equal((component.match(/dangerouslySetInnerHTML/g) ?? []).length, 1);
  });

  it("o logotipo referenciado é o arquivo oficial (quadrado, ≥ 112 px, PNG com transparência)", () => {
    const b = readFileSync(new URL("public/logo.png", root));
    assert.equal(b.subarray(1, 4).toString("latin1"), "PNG");
    const [w, h] = [b.readUInt32BE(16), b.readUInt32BE(20)];
    assert.equal(w, h);
    assert.ok(w >= 112);
    assert.equal(w, 512);
  });
});
