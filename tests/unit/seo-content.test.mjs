import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * SEO — Etapa 4 (intenção de busca e conteúdo comercial): verificações do código-fonte da home e do conteúdo.
 * O HTML gerado é conferido em tests/seo/rendered-html.test.mjs.
 */
const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const home = read("src/app/(public)/page.tsx");
const marketing = read("src/config/marketing.ts");

const HOME_TITLE = home.match(/const HOME_TITLE = "([^"]+)"/)?.[1] ?? "";
const HOME_DESCRIPTION = home.match(/const SEO_DESCRIPTION =\s*"([^"]+)"/)?.[1] ?? "";

describe("Título e descrição da home (Etapa 4)", () => {
  it("o título traz a categoria do produto e a marca, em tamanho razoável", () => {
    assert.ok(HOME_TITLE.length > 0);
    assert.match(HOME_TITLE, /Prime Ges/);
    assert.match(HOME_TITLE, /[Ss]istema de gestão/);
    assert.match(HOME_TITLE, /pequenos negócios/);
    assert.ok(HOME_TITLE.length <= 65, "tamanho " + HOME_TITLE.length);
  });

  it("a descrição explica produto, público e benefícios comprovados, sem promessas", () => {
    assert.ok(HOME_DESCRIPTION.length >= 110 && HOME_DESCRIPTION.length <= 170, "tamanho " + HOME_DESCRIPTION.length);
    for (const term of ["MEI", "pequenos negócios", "vendas", "caixa", "estoque", "clientes", "financeiro"]) assert.ok(HOME_DESCRIPTION.includes(term), term);
    assert.ok(!/garant|melhor|menor preço|grátis|aument|lucro|resultado/i.test(HOME_DESCRIPTION), "sem promessa nem condição comercial dinâmica");
    assert.ok(!/\d+[.,]\d{2}|R\$/.test(HOME_DESCRIPTION), "sem preços");
  });

  it("título e descrição alimentam og:title/og:description e o título é absoluto (sem repetir a marca pelo modelo)", () => {
    assert.match(home, /title:\s*\{\s*absolute:\s*HOME_TITLE\s*\}/);
    assert.match(home, /description:\s*SEO_DESCRIPTION/);
    assert.match(home, /openGraph:\s*publicOpenGraph\("\/",\s*\{\s*title:\s*HOME_TITLE,\s*description:\s*SEO_DESCRIPTION\s*\}\)/);
    assert.match(home, /alternates:\s*\{\s*canonical:\s*siteConfig\.url\s*\}/);
  });

  it("os metadados de login, cadastro e páginas legais não foram alterados nesta etapa (marca via modelo, descrições próprias)", () => {
    assert.match(read("src/app/(public)/login/page.tsx"), /title:\s*"Entrar"/);
    assert.match(read("src/app/(public)/register/page.tsx"), /title:\s*"Criar conta"/);
    for (const slug of ["termos-de-uso", "politica-de-privacidade", "politica-de-reembolso", "direitos-do-titular"]) {
      assert.match(read(`src/app/(public)/${slug}/page.tsx`), /openGraph:\s*publicOpenGraph\(/, slug);
    }
  });
});

describe("H1 e hierarquia", () => {
  it("há um único H1 na página e ele diz o que o produto é e para quem", () => {
    assert.equal((home.match(/<h1[\s>]/g) ?? []).length, 1);
    const h1 = home.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
    assert.match(h1, /Sistema de gestão para pequenos negócios/);
    assert.match(h1, /da venda ao caixa/);
  });

  it("o H1 não repete a mesma palavra-chave de forma artificial", () => {
    const h1 = (home.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "").replace(/<[^>]+>/g, " ").toLowerCase();
    for (const term of ["sistema", "gestão", "negócios"]) assert.ok((h1.match(new RegExp(term, "g")) ?? []).length <= 1, term);
  });
});

describe("Conteúdo comercial: só o que o produto comprovadamente faz", () => {
  const copy = home + "\n" + marketing;
  const withoutComments = copy.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("não anuncia nota fiscal, integrações, veículos/placa nem promessas de resultado ou de preço", () => {
    const forbidden = [
      /integra[çc][ãa]o|integra com|integrado a|API pública/i,
      /ve[íi]culos?\b/i,
      /\bplaca\b/i,
      /menor pre[çc]o|mais barato|melhor (sistema|pre[çc]o|do mercado)|n[úu]mero 1|l[íi]der/i,
      /aument(e|ar|o) (o )?(seu )?(faturamento|lucro|vendas)|lucre|dobre|garantid[oa]/i,
      /depoimento|avalia[çc][õo]es|clientes satisfeitos|mais de \d+/i,
    ];
    for (const re of forbidden) assert.ok(!re.test(withoutComments), "texto proibido: " + re);
  });

  it("toda menção a nota fiscal é uma NEGAÇÃO (o produto não emite)", () => {
    const sentences = withoutComments.split(/(?<=[.!?"])\s+/);
    for (const sentence of sentences.filter((s) => /nota fiscal|NF-?e|documentos? fiscais?/i.test(s))) {
      assert.match(sentence, /não (emite|substitui)/i, sentence.slice(0, 120));
    }
  });

  it("os segmentos citados correspondem a tipos de negócio do produto (enum business_type) e a lista da home é coerente", () => {
    const types = read("src/types/company.ts");
    for (const t of ["bakery", "car_wash", "automotive_detailing", "grocery", "restaurant", "snack_bar"]) assert.ok(types.includes(`"${t}"`), t);
    for (const name of ["Padarias", "Mercadinhos e mercearias", "Restaurantes", "Lanchonetes", "Lava-rápidos", "Estética automotiva"]) {
      assert.ok(marketing.includes(`name: "${name}"`), name);
      assert.ok(home.includes(name.includes(" ") ? `"${name}"` : name), "módulos definidos para " + name);
    }
  });

  it("os módulos citados na home são os 8 marcados como disponíveis (nada de agenda, compras, relatórios ou equipe sem confirmação)", () => {
    const available = [...marketing.matchAll(/\{ name: "([^"]+)", description: "[^"]+", icon: \w+, available: true \}/g)].map((m) => m[1]);
    assert.deepEqual(available, ["Clientes", "Produtos", "Serviços", "Vendas", "Fidelidade", "Caixa", "Estoque", "Financeiro"]);
    const visible = withoutComments.replace(/question:[\s\S]*?\},/g, "");
    for (const unconfirmed of [/\bagenda\b/i, /\bcompras\b/i, /\bfornecedores?\b/i, /\brelat[óo]rios\b/i, /\bequipe\b/i]) {
      assert.ok(!unconfirmed.test(visible.replace(/Posso ter outras pessoas[\s\S]*?\},/, "")), "módulo sem confirmação comercial: " + unconfirmed);
    }
  });

  it("a home não contém preços fixos (planos e valores vêm do catálogo, na seção de planos)", () => {
    assert.ok(!/R\$\s*\d/.test(withoutComments));
    assert.match(home, /getPublicPlans\(\)/);
  });
});

describe("Links internos úteis", () => {
  it("há atalhos para planos, recursos, cadastro, regras de reembolso, termos e demais documentos", () => {
    for (const href of ['href="#precos"', 'href="#recursos"', 'href="#como-funciona"', 'href="/politica-de-reembolso"', 'href="/termos-de-uso"', 'href="/politica-de-privacidade"', 'href="/direitos-do-titular"', "siteConfig.links.register"]) {
      assert.ok(home.includes(href), href);
    }
  });

  it("os destinos de âncora existem na própria página", () => {
    for (const id of ["precos", "recursos", "como-funciona", "produto", "segmentos", "faq"]) assert.ok(home.includes(`id="${id}"`), id);
  });

  it("as chamadas para ação existentes continuam (Criar conta, Ver como funciona, Entrar)", () => {
    for (const label of ["Criar conta", "Ver como funciona", "Entrar"]) assert.ok(home.includes(label), label);
  });
});
