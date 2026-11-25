/**
 * Dados estruturados (JSON-LD, schema.org) da página inicial do Prime Ges. Módulo PURO (sem imports): roda no
 * servidor e direto nos testes do Node.
 *
 * Só entra aqui o que é VERDADEIRO e verificável no produto e no conteúdo público:
 *  - WebSite: nome, URL canônica, idioma e a organização como publicadora.
 *  - Organization: a MARCA Prime Ges (nome, URL e o arquivo oficial do logotipo). NÃO é a pessoa jurídica: razão social,
 *    CNPJ, endereço, telefone e redes sociais estão pendentes (marcadores [BLOCKED] nas páginas legais) e ficam de fora.
 *  - SoftwareApplication: categoria BusinessApplication, aplicação web, descrição igual à da home e a lista dos módulos
 *    marcados como disponíveis na home.
 *
 * Deliberadamente OMITIDOS (não há fonte pública confirmada ou seriam dados inventados): `offers` (preços e planos vêm do
 * catálogo no banco e mudam), `aggregateRating`/`review`/número de usuários, `FAQPage`, `sameAs`, `contactPoint`,
 * `address`, `legalName`, `taxID`, `telephone`, `potentialAction` (a home não tem busca interna).
 *
 * Todos os objetos compartilham UMA origem (a de siteConfig.url, já validada) e identificadores `@id` estáveis.
 */
export interface StructuredDataInput {
  /** Origem canônica validada (ex.: https://primeges.com.br), sem barra final. */
  origin: string;
  name: string;
  /** Mesma descrição da meta description da home. */
  description: string;
  /** Caminho do arquivo oficial do logotipo (ex.: "/logo.png"); a imagem tem lado ≥ 112 px. */
  logoPath: string;
  logoSize: number;
  /** Nomes dos módulos disponíveis (mesma lista exibida na home). */
  featureNames: readonly string[];
}

export interface JsonLdNode {
  "@type": string;
  "@id": string;
  [key: string]: unknown;
}

export interface StructuredDataGraph {
  "@context": "https://schema.org";
  "@graph": JsonLdNode[];
}

export function structuredDataIds(origin: string) {
  const base = origin.replace(/\/+$/, "");
  return { website: `${base}/#website`, organization: `${base}/#organization`, software: `${base}/#software` } as const;
}

export function buildStructuredData(input: StructuredDataInput): StructuredDataGraph {
  const origin = input.origin.replace(/\/+$/, "");
  const ids = structuredDataIds(origin);

  const organization: JsonLdNode = {
    "@type": "Organization",
    "@id": ids.organization,
    name: input.name,
    url: origin,
    logo: {
      "@type": "ImageObject",
      url: origin + input.logoPath,
      width: input.logoSize,
      height: input.logoSize,
    },
  };

  const website: JsonLdNode = {
    "@type": "WebSite",
    "@id": ids.website,
    name: input.name,
    url: origin,
    inLanguage: "pt-BR",
    publisher: { "@id": ids.organization },
  };

  const software: JsonLdNode = {
    "@type": "SoftwareApplication",
    "@id": ids.software,
    name: input.name,
    url: origin,
    description: input.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "pt-BR",
    featureList: [...input.featureNames],
    publisher: { "@id": ids.organization },
    isPartOf: { "@id": ids.website },
  };

  return { "@context": "https://schema.org", "@graph": [organization, website, software] };
}

/**
 * Serializa para colocar DENTRO de <script type="application/ld+json">. Além do JSON.stringify, escapa `<`, `>`, `&` e
 * os separadores de linha U+2028/U+2029 (sequências como "</script>" ou "<!--" no texto não conseguem fechar a tag).
 */
const BACKSLASH = String.fromCharCode(92);
const ESCAPES: Record<string, string> = {
  "<": BACKSLASH + "u003c",
  ">": BACKSLASH + "u003e",
  "&": BACKSLASH + "u0026",
  [String.fromCharCode(0x2028)]: BACKSLASH + "u2028",
  [String.fromCharCode(0x2029)]: BACKSLASH + "u2029",
};

export function serializeJsonLd(data: unknown): string {
  let out = "";
  for (const char of JSON.stringify(data)) out += ESCAPES[char] ?? char;
  return out;
}

export interface ArticleDataInput {
  /** Origem canônica validada, sem barra final. */
  origin: string;
  name: string;
  logoPath: string;
  /** Caminho da página, ex.: "/duvidas/o-que-e-saas". */
  path: string;
  /** O mesmo texto do H1. */
  headline: string;
  description: string;
  /** Data real de publicação/revisão (AAAA-MM-DD). */
  date: string;
  /** Trilha exibida na página, da home até esta (nome + caminho). */
  breadcrumb: readonly { name: string; path: string }[];
}

/** Artigo de dúvida: trilha de navegação (BreadcrumbList) e o artigo, publicado pela mesma marca da home. */
export function buildArticleData(input: ArticleDataInput): StructuredDataGraph {
  const origin = input.origin.replace(/\/+$/, "");
  const url = origin + input.path;
  const ids = structuredDataIds(origin);
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": ids.organization, name: input.name, url: origin, logo: origin + input.logoPath },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#trilha`,
        itemListElement: input.breadcrumb.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.name,
          item: item.path === "/" ? origin : origin + item.path,
        })),
      },
      {
        "@type": "Article",
        "@id": `${url}#artigo`,
        headline: input.headline,
        description: input.description,
        inLanguage: "pt-BR",
        datePublished: input.date,
        dateModified: input.date,
        mainEntityOfPage: url,
        author: { "@id": ids.organization },
        publisher: { "@id": ids.organization },
      },
    ],
  };
}
