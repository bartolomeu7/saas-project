import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SiteUrlError, absoluteUrl, detectDeployKind, resolveSiteUrl } from "../../src/lib/seo/site-url.ts";
import { SITEMAP_FORBIDDEN_NAME_PREFIXES, SITEMAP_FORBIDDEN_ROUTES, buildSitemapEntries } from "../../src/lib/seo/sitemap-entries.ts";

/** SEO — Etapa 3: domínio canônico, sitemap e estratégia de rastreamento (código-fonte e funções puras). */
const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const PROD = { vercelEnv: "production" };

describe("S02/S16 — validação do domínio público (resolveSiteUrl)", () => {
  it("variável ausente ou vazia: usa o domínio de produção padrão (nunca localhost) e SINALIZA", () => {
    for (const appUrl of [undefined, "", "   "]) {
      const r = resolveSiteUrl({ appUrl });
      assert.equal(r.url, "https://primeges.com.br");
      assert.equal(r.source, "fallback");
      assert.ok(r.warnings.length === 1 && /ausente/.test(r.warnings[0]));
    }
  });

  it("normaliza para a origem: sem barra final, caminho, query ou hash (evita https://x//termos-de-uso)", () => {
    assert.equal(resolveSiteUrl({ appUrl: "https://primeges.com.br/" }).url, "https://primeges.com.br");
    const r = resolveSiteUrl({ appUrl: "https://primeges.com.br/qualquer?x=1#y" });
    assert.equal(r.url, "https://primeges.com.br");
    assert.ok(r.warnings.some((w) => /caminho\/query\/hash/.test(w)));
  });

  it("valor que não é URL http(s) é erro em qualquer ambiente", () => {
    for (const appUrl of ["primeges.com.br", "/relativo", "ftp://primeges.com.br", "https//errado", "javascript:alert(1)"]) {
      assert.throws(() => resolveSiteUrl({ appUrl }), SiteUrlError, appUrl);
      assert.throws(() => resolveSiteUrl({ appUrl, vercelEnv: "preview" }), SiteUrlError, appUrl);
    }
  });

  it("Production: http, localhost, rede interna e *.vercel.app FALHAM (o build deve parar)", () => {
    for (const appUrl of [
      "http://primeges.com.br",
      "https://localhost:3000",
      "http://127.0.0.1:3000",
      "https://192.168.0.10",
      "https://10.1.2.3",
      "https://meu-servidor.local",
      "https://saas-project-eta-eight.vercel.app",
      "https://qualquer-preview-abc123.vercel.app",
    ]) {
      assert.throws(() => resolveSiteUrl({ appUrl, ...PROD }), SiteUrlError, appUrl);
    }
    // também quando a produção é declarada pela variável pública
    assert.throws(() => resolveSiteUrl({ appUrl: "http://localhost:3000", appEnv: "production" }), SiteUrlError);
  });

  it("Production: o domínio esperado passa sem avisos; outro domínio https só AVISA (mudança pode ser legítima)", () => {
    const ok = resolveSiteUrl({ appUrl: "https://primeges.com.br", ...PROD });
    assert.deepEqual({ url: ok.url, kind: ok.kind, warnings: ok.warnings }, { url: "https://primeges.com.br", kind: "production", warnings: [] });
    const www = resolveSiteUrl({ appUrl: "https://www.primeges.com.br", ...PROD });
    assert.equal(www.url, "https://www.primeges.com.br");
    assert.ok(www.warnings.some((w) => /difere do esperado/.test(w)));
  });

  it("Preview e desenvolvimento continuam funcionando com *.vercel.app e localhost (nada é bloqueado ali)", () => {
    assert.equal(resolveSiteUrl({ appUrl: "https://abc-preview.vercel.app", vercelEnv: "preview" }).url, "https://abc-preview.vercel.app");
    assert.equal(resolveSiteUrl({ appUrl: "http://localhost:3000", vercelEnv: "development" }).url, "http://localhost:3000");
    assert.equal(resolveSiteUrl({ appUrl: "http://localhost:3000" }).url, "http://localhost:3000");
    assert.equal(resolveSiteUrl({ appUrl: "https://x.vercel.app", appEnv: "staging" }).kind, "preview");
  });

  it("detectDeployKind diferencia produção, preview e desenvolvimento", () => {
    assert.equal(detectDeployKind({ vercelEnv: "production" }), "production");
    assert.equal(detectDeployKind({ appEnv: "production" }), "production");
    assert.equal(detectDeployKind({ vercelEnv: "preview" }), "preview");
    assert.equal(detectDeployKind({ appEnv: "staging" }), "preview");
    assert.equal(detectDeployKind({}), "development");
    assert.equal(detectDeployKind({ appEnv: "development" }), "development");
  });

  it("absoluteUrl nunca duplica barras", () => {
    assert.equal(absoluteUrl("https://a.com/", "/termos"), "https://a.com/termos");
    assert.equal(absoluteUrl("https://a.com", "termos"), "https://a.com/termos");
    assert.equal(absoluteUrl("https://a.com//", "/"), "https://a.com");
  });

  it("a configuração central usa a validação e não define localhost como valor padrão", () => {
    const site = read("src/config/site.ts");
    assert.match(site, /resolveSiteUrl\(\{/);
    assert.match(site, /url:\s*siteUrl\.url/);
    assert.ok(!/localhost/.test(site.replace(/\/\/.*$/gm, "")), "sem localhost no código (fora de comentários)");
    assert.ok(!/process\.env\.NEXT_PUBLIC_APP_URL\s*\?\?/.test(site), "sem fallback manual");
  });
});

describe("S06 — entradas do sitemap (buildSitemapEntries)", () => {
  const ORIGIN = "https://primeges.com.br";

  it("monta URLs absolutas, sem duplicatas, na ordem recebida", () => {
    const entries = buildSitemapEntries(ORIGIN + "/", [
      { path: "/" },
      { path: "/termos-de-uso", lastModified: "2026-10-21" },
      { path: "/termos-de-uso", lastModified: "2026-10-22" },
      { path: "/politica-de-privacidade" },
    ]);
    assert.deepEqual(entries, [
      { url: "https://primeges.com.br" },
      { url: "https://primeges.com.br/termos-de-uso", lastModified: "2026-10-21" },
      { url: "https://primeges.com.br/politica-de-privacidade" },
    ]);
  });

  it("lastModified só existe quando a data é real (AAAA-MM-DD válida); caso contrário o campo é omitido", () => {
    const bad = [undefined, null, "", "ontem", "2026-13-45", "2026-02-30", "2026-10-21T00:00:00Z", "21/10/2026"];
    for (const lastModified of bad) {
      const [entry] = buildSitemapEntries(ORIGIN, [{ path: "/x", lastModified }]);
      assert.ok(!("lastModified" in entry), String(lastModified));
    }
    assert.equal(buildSitemapEntries(ORIGIN, [{ path: "/x", lastModified: "2026-10-21" }])[0].lastModified, "2026-10-21");
  });

  it("páginas marcadas como não indexáveis ficam de fora", () => {
    assert.deepEqual(buildSitemapEntries(ORIGIN, [{ path: "/termos-de-uso", indexable: false }]), []);
  });

  it("rotas privadas, administrativas, de API, login, cadastro e conta excluída NUNCA entram (erro explícito)", () => {
    const samples = [...SITEMAP_FORBIDDEN_ROUTES, "/app/clientes", "/admin/plans", "/api/presence", "/conta/x", "/acesso-sessoes", "/acesso-indisponivel"];
    for (const path of samples) assert.throws(() => buildSitemapEntries(ORIGIN, [{ path }]), /não pode entrar no sitemap/, path);
    assert.ok(SITEMAP_FORBIDDEN_NAME_PREFIXES.includes("/acesso-"));
    for (const path of ["/login", "/register", "/conta-excluida"]) assert.ok(SITEMAP_FORBIDDEN_ROUTES.includes(path), path);
  });

  it("caminhos inválidos (query, hash, espaço, relativo, barra dupla) são recusados", () => {
    for (const path of ["termos", "/a?b=1", "/a#b", "/a b", "//a"]) assert.throws(() => buildSitemapEntries(ORIGIN, [{ path }]), /inválido/, path);
  });

  it("o gerador do Next usa a origem validada, não usa a data atual nem changefreq/priority e condiciona as páginas legais aos marcadores", () => {
    const src = read("src/app/sitemap.ts");
    assert.match(src, /buildSitemapEntries\(siteConfig\.url,/);
    assert.ok(!/new Date\(/.test(src), "lastModified não pode ser 'agora'");
    assert.ok(!/changeFrequency|changefreq|priority/.test(src));
    assert.match(src, /findLegalMarkers\(doc\)\.length === 0/);
    assert.ok(!/localhost|vercel\.app/.test(src));
    for (const path of ["/termos-de-uso", "/politica-de-privacidade", "/politica-de-reembolso", "/direitos-do-titular"]) assert.ok(src.includes(`"${path}"`), path);
    for (const path of ["/login", "/register", "/conta-excluida", "/app", "/admin", "/api"]) assert.ok(!src.includes(`"${path}`), path + " não pode estar no sitemap");
  });
});

describe("S07 — rastreamento: robots.txt coerente com as meta tags", () => {
  const robots = read("src/app/robots.ts");
  const disallow = (robots.match(/disallow:\s*\[([^\]]*)\]/)?.[1] ?? "").match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];

  it("áreas privadas, administração, onboarding, /conta e APIs continuam bloqueadas no robots.txt", () => {
    for (const rule of ["/app", "/app/*", "/admin", "/admin/*", "/onboarding", "/api/*"]) assert.ok(disallow.includes(rule), rule);
  });

  it("/conta é bloqueada SEM bloquear /conta-excluida (regras '/conta$' e '/conta/', nunca o prefixo '/conta')", () => {
    assert.ok(disallow.includes("/conta$") && disallow.includes("/conta/"));
    assert.ok(!disallow.includes("/conta"));
  });

  it("login, cadastro e conta excluída NÃO estão bloqueados: o Google precisa ler o noindex", () => {
    for (const rule of disallow) assert.ok(!/^\/(login|register|conta-excluida)/.test(rule), rule);
    assert.ok(!disallow.includes("/"));
  });

  it("as três telas declaram noindex, nofollow", () => {
    for (const p of ["src/app/(public)/login/page.tsx", "src/app/(public)/register/page.tsx", "src/app/conta-excluida/page.tsx"]) {
      assert.match(read(p), /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/, p);
    }
  });

  it("o robots.txt aponta para o sitemap na origem validada e não menciona localhost", () => {
    assert.match(robots, /sitemap:\s*`\$\{siteConfig\.url\}\/sitemap\.xml`/);
    assert.ok(!/localhost/.test(robots));
  });
});

describe("Open Graph das páginas legais e da home", () => {
  it("as páginas legais usam o helper (og:url na origem validada + imagem da Etapa 2) e mantêm o canonical", () => {
    for (const slug of ["termos-de-uso", "politica-de-privacidade", "politica-de-reembolso", "direitos-do-titular"]) {
      const src = read(`src/app/(public)/${slug}/page.tsx`);
      assert.match(src, new RegExp(`openGraph:\\s*publicOpenGraph\\("/${slug}"\\)`), slug);
      assert.match(src, new RegExp("canonical:\\s*`\\$\\{siteConfig\\.url\\}/" + slug + "`"), slug);
    }
  });

  it("o helper reaproveita ogImage e siteConfig.url", () => {
    const site = read("src/config/site.ts");
    assert.match(site, /export function publicOpenGraph\(/);
    assert.match(site, /url:\s*absoluteUrl\(siteConfig\.url, path\)/);
    assert.match(site, /images:\s*\[ogImage\]/);
  });
});
