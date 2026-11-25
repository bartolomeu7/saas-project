import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DOUBTS, DOUBT_CATEGORIES, DOUBTS_UPDATED_AT, getDoubt } from "../../src/content/duvidas.ts";
import { buildArticleData } from "../../src/lib/seo/structured-data.ts";

/** Páginas de dúvidas (SEO): cada uma precisa ser única, honesta e ligada às outras. */
const text = (doubt) => JSON.stringify(doubt);

describe("conteúdo das dúvidas", () => {
  it("endereços, perguntas, títulos e descrições são únicos e têm tamanho de resultado de busca", () => {
    assert.ok(DOUBTS.length >= 12);
    for (const field of ["slug", "question", "metaTitle", "description"]) {
      assert.equal(new Set(DOUBTS.map((d) => d[field])).size, DOUBTS.length, field);
    }
    for (const d of DOUBTS) {
      assert.match(d.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
      assert.ok(d.metaTitle.length <= 50, `${d.slug}: título com ${d.metaTitle.length}`);
      assert.ok(d.description.length >= 110 && d.description.length <= 170, `${d.slug}: descrição com ${d.description.length}`);
      assert.ok(d.question.endsWith("?"), d.slug);
      assert.ok(d.answer.length >= 120, d.slug + ": resposta direta curta demais");
      assert.ok(d.sections.length >= 1 && d.prime.points.length >= 3, d.slug);
      assert.ok(DOUBT_CATEGORIES.includes(d.category), d.slug);
    }
  });

  it("toda dúvida relacionada existe, não aponta para si mesma e toda página recebe pelo menos um link", () => {
    for (const d of DOUBTS) {
      for (const slug of d.related) assert.ok(getDoubt(slug) && slug !== d.slug, `${d.slug} → ${slug}`);
    }
    const hub = readFileSync(new URL("../../src/app/(public)/duvidas/page.tsx", import.meta.url), "utf8");
    assert.match(hub, /DOUBTS\.filter\(\(doubt\) => doubt\.category === category\)/);
  });

  it("não promete o que o produto não faz: sem preço escrito, superlativo, depoimento ou nota fiscal afirmada", () => {
    for (const d of DOUBTS) {
      assert.doesNotMatch(text(d), /R\$\s*\d/, d.slug);
      const ours = [d.prime.intro, ...d.prime.points, d.limit ?? ""].join(" ");
      assert.doesNotMatch(ours, /o melhor|número 1|l[íi]der|garantid|mais barato|depoimento|integra[çc][ãa]o com|integrado (a|com)/i, d.slug);
      for (const sentence of ours.split(/(?<=[.!?])\s+/).filter((s) => /nota fiscal|cupom fiscal/i.test(s))) {
        assert.match(sentence, /não (emite|substitui)/i, `${d.slug}: ${sentence}`);
      }
    }
  });
});

describe("SEO das dúvidas", () => {
  it("dados estruturados com trilha e artigo na mesma origem, sem preço nem avaliação", () => {
    const data = buildArticleData({
      origin: "https://primeges.com.br/",
      name: "Prime Ges",
      logoPath: "/logo.png",
      path: "/duvidas/o-que-e-saas",
      headline: "O que é SaaS?",
      description: "Descrição",
      date: DOUBTS_UPDATED_AT,
      breadcrumb: [{ name: "Início", path: "/" }, { name: "Dúvidas", path: "/duvidas" }],
    });
    const types = data["@graph"].map((node) => node["@type"]);
    assert.deepEqual(types, ["Organization", "BreadcrumbList", "Article"]);
    const json = JSON.stringify(data);
    assert.doesNotMatch(json, /aggregateRating|offers|review|br\.com\.br\/\//);
    assert.deepEqual(data["@graph"][1].itemListElement.map((i) => i.item), ["https://primeges.com.br", "https://primeges.com.br/duvidas"]);
    assert.match(DOUBTS_UPDATED_AT, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("um endereço só: /perguntas vai para /duvidas e www/http vão para https sem www, sem tocar no acesso local", () => {
    const config = readFileSync(new URL("../../next.config.js", import.meta.url), "utf8");
    assert.match(config, /source: "\/perguntas", destination: "\/duvidas", permanent: true/);
    assert.match(config, /type: "host", value: "www\.primeges\.com\.br"/);
    assert.match(config, /type: "host", value: "primeges\.com\.br" \},\s*\{ type: "header", key: "x-forwarded-proto", value: "http" \}/);
  });
});
