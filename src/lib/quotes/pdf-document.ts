/**
 * Desenho do PDF do orçamento (@react-pdf/renderer). Escrito com React.createElement num arquivo ".ts" (sem JSX) para os testes
 * de Node conseguirem importar e gerar o PDF de verdade. Só posiciona: o conteúdo vem pronto de pdf-model.ts.
 * Dois modelos ("classic" e "modern") com a cor da marca da empresa; fonte Inter (public/fonts) com Helvetica de reserva.
 */
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { QuotePdfModel } from "./pdf-model.ts";
import { BRAND_LEAD, BRAND_NAME, BRAND_SITE, BRAND_TAGLINE, brandLogo } from "./brand.ts";

/**
 * Fábrica de elementos própria (no lugar de React.createElement). O Next 16 embute o próprio React 19 nas rotas de API,
 * e o @react-pdf/renderer (pacote externo) usa o React 18 do node_modules: elementos criados pelo React embutido têm outro
 * símbolo ($$typeof) e o PDF quebra com "Minified React error #31". Aqui o símbolo é o do React 18, o que o react-pdf espera.
 */
const REACT_ELEMENT = Symbol.for("react.element");
type PdfElement = { $$typeof: symbol; type: unknown; key: string | null; ref: null; props: Record<string, unknown>; _owner: null; _store: { validated: boolean } };

export function h(type: unknown, config?: Record<string, unknown> | null, ...children: unknown[]): PdfElement {
  const props: Record<string, unknown> = {};
  let key: string | null = null;
  for (const name of Object.keys(config ?? {})) {
    if (name === "key") key = String((config as Record<string, unknown>)[name]);
    else if (name !== "ref") props[name] = (config as Record<string, unknown>)[name];
  }
  if (children.length === 1) props.children = children[0];
  else if (children.length > 1) props.children = children;
  return { $$typeof: REACT_ELEMENT, type, key, ref: null, props, _owner: null, _store: { validated: true } };
}


const INK = "#1f2937";
const MUTED = "#6b7280";
const LINE = "#d1d5db";

// ---------------------------------------------------------------- fonte
const FONT_DIR = path.join(process.cwd(), "public", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "Inter-Regular.woff");
const FONT_BOLD = path.join(FONT_DIR, "Inter-Bold.woff");
const HAS_INTER = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);

if (HAS_INTER) {
  Font.register({
    family: "Inter",
    fonts: [
      { src: FONT_REGULAR, fontWeight: 400 },
      { src: FONT_BOLD, fontWeight: 700 },
    ],
  });
  // sem hifenização automática: palavras nunca são cortadas com hífen no meio do nome do cliente ou do item
  Font.registerHyphenationCallback((word) => [word]);
}

const FAMILY = HAS_INTER ? "Inter" : "Helvetica";
const BOLD = { fontFamily: FAMILY, fontWeight: 700 } as const;

export interface PdfLogo {
  data: Buffer;
  format: "png" | "jpg";
}

/** Larguras (em %) das colunas; com desconto por item aparece a coluna "Desc.". */
function columns(withDiscount: boolean) {
  return withDiscount ? { n: "5%", d: "37%", q: "12%", p: "15%", x: "14%", t: "17%" } : { n: "5%", d: "45%", q: "13%", p: "17%", x: "0%", t: "20%" };
}

function makeStyles(model: QuotePdfModel) {
  const { brand, onBrand, brandText, soft } = model.palette;
  const modern = model.template === "modern";
  return StyleSheet.create({
    page: { paddingTop: 36, paddingBottom: 72, paddingHorizontal: 36, fontFamily: FAMILY, fontSize: 9.5, color: INK },
    // fontSize e lineHeight juntos, num View que NÃO contém o "Página X de Y": lineHeight no estilo da Page faz o react-pdf descartar o texto dinâmico
    body: { fontSize: 9.5, lineHeight: 1.4 },
    header: modern
      ? { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: brand, marginTop: -36, marginHorizontal: -36, paddingTop: 30, paddingBottom: 22, paddingHorizontal: 36 }
      : { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: brand },
    logoBox: modern ? { backgroundColor: "#ffffff", borderRadius: 6, padding: 7 } : {},
    logo: { maxWidth: modern ? 150 : 140, maxHeight: modern ? 58 : 66, objectFit: "contain" },
    companyBox: { flexGrow: 1, flexShrink: 1, paddingLeft: 14, alignItems: "flex-end" },
    companyName: { fontSize: modern ? 16 : 14, ...BOLD, color: modern ? onBrand : INK, lineHeight: 1.25, marginBottom: 3 },
    small: { fontSize: 8.5, color: modern ? onBrand : MUTED, textAlign: "right" },
    titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 18 },
    kicker: { fontSize: 8, letterSpacing: 1.2, color: brandText, ...BOLD },
    title: { fontSize: 20, ...BOLD, color: modern ? brandText : INK, lineHeight: 1.25 },
    draft: { fontSize: 9, color: "#b45309", ...BOLD, marginTop: 4 },
    meta: { fontSize: 9, color: MUTED, textAlign: "right" },
    validity: { marginTop: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10, backgroundColor: soft, color: brandText, fontSize: 9, ...BOLD, textAlign: "center" },
    subject: { marginTop: 8, fontSize: 11.5, ...BOLD, lineHeight: 1.3 },
    intro: { marginTop: 8, fontSize: 10, color: INK },
    box: modern
      ? { marginTop: 14, padding: 10, backgroundColor: soft, borderLeftWidth: 3, borderLeftColor: brand, borderRadius: 3 }
      : { marginTop: 14, padding: 10, backgroundColor: "#f3f4f6", borderRadius: 3 },
    boxLabel: { fontSize: 8, color: brandText, textTransform: "uppercase", marginBottom: 3, ...BOLD },
    customerName: { fontSize: 11, ...BOLD },
    table: { marginTop: 14 },
    th: modern
      ? { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, fontSize: 8.5, color: brandText, ...BOLD, borderBottomWidth: 1.5, borderBottomColor: brand }
      : { flexDirection: "row", backgroundColor: brand, color: onBrand, paddingVertical: 5, paddingHorizontal: 4, fontSize: 8.5, ...BOLD },
    tr: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: LINE },
    trAlt: { backgroundColor: modern ? soft : "#ffffff" },
    totals: { marginTop: 10, alignSelf: "flex-end", width: 220 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
    totalFinal: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7, paddingHorizontal: 8, marginTop: 4, backgroundColor: brand, color: onBrand, borderRadius: modern ? 5 : 0, ...BOLD, fontSize: 12.5 },
    section: { marginTop: 14 },
    sectionTitle: { fontSize: 8.5, color: brandText, textTransform: "uppercase", ...BOLD, marginBottom: 3 },
    pix: { marginTop: 16, flexDirection: "row", padding: 10, borderWidth: 1, borderColor: brand, borderRadius: 5 },
    pixQr: { width: 92, height: 92 },
    pixInfo: { flexGrow: 1, flexShrink: 1, paddingLeft: 12 },
    pixTitle: { fontSize: 11, ...BOLD, color: brandText },
    pixCode: { marginTop: 4, fontSize: 6.5, color: MUTED, lineHeight: 1.25 },
    accept: { marginTop: 16 },
    acceptRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 24 },
    signature: { width: "46%", borderTopWidth: 0.8, borderTopColor: INK, paddingTop: 3, fontSize: 8.5, color: MUTED },
    watermark: { position: "absolute", top: 330, left: 40, fontSize: 96, ...BOLD, color: "#f3f4f6", transform: "rotate(-32deg)" },
    footer: { position: "absolute", left: 36, right: 36, bottom: 14 },
    footerLine: { flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: MUTED, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6 },
    footerText: { flexGrow: 1, flexShrink: 1, paddingRight: 90 },
    pageNumberBox: { position: "absolute", left: 36, right: 36, bottom: 40, flexDirection: "row", justifyContent: "flex-end" },
    pageNumber: { fontSize: 8, color: MUTED, textAlign: "right", width: 90 },
    brandRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 7, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10, backgroundColor: soft },
    brandLogo: { width: 15, height: 14, marginRight: 5 },
    brandText: { fontSize: 7.5, color: MUTED },
    brandName: { fontSize: 7.5, color: brandText, ...BOLD },
  });
}

export function buildQuotePdfElement(model: QuotePdfModel, logo: PdfLogo | null, pageNumbers = true, qr: Buffer | null = null) {
  const styles = makeStyles(model);
  const modern = model.template === "modern";
  const w = columns(model.hasItemDiscount);

  const logoElement = logo ? h(Image, { src: { data: logo.data, format: logo.format }, style: styles.logo }) : null;
  const header = h(
    View,
    { style: styles.header },
    logoElement ? h(View, { style: styles.logoBox }, logoElement) : h(View, null),
    h(
      View,
      { style: styles.companyBox },
      h(Text, { style: styles.companyName }, model.company.name),
      model.company.legalName && model.company.legalName !== model.company.name ? h(Text, { style: styles.small }, model.company.legalName) : null,
      model.company.document ? h(Text, { style: styles.small }, `CPF/CNPJ ${model.company.document}`) : null,
      model.company.address ? h(Text, { style: styles.small }, model.company.address) : null,
      model.company.contacts.length ? h(Text, { style: styles.small }, model.company.contacts.join("  |  ")) : null
    )
  );

  const titleRow = h(
    View,
    { style: styles.titleRow },
    h(
      View,
      null,
      modern ? h(Text, { style: styles.kicker }, "PROPOSTA COMERCIAL") : null,
      h(Text, { style: styles.title }, `Orçamento ${model.number}`),
      model.isDraft ? h(Text, { style: styles.draft }, "RASCUNHO - ainda não enviado ao cliente") : null
    ),
    h(
      View,
      { style: { alignItems: "flex-end" } },
      h(Text, { style: styles.meta }, `Emitido em ${model.issuedOn}`),
      h(Text, { style: modern ? styles.validity : styles.meta }, `Válido até ${model.validUntil}`)
    )
  );

  const customer = h(
    View,
    { style: styles.box, wrap: false },
    h(Text, { style: styles.boxLabel }, "Cliente"),
    h(Text, { style: styles.customerName }, model.customer.name),
    ...model.customer.lines.map((line, index) => h(Text, { key: `c${index}` }, line))
  );

  const headRow = h(
    View,
    { style: styles.th },
    h(Text, { style: { width: w.n } }, "#"),
    h(Text, { style: { width: w.d } }, "Descrição"),
    h(Text, { style: { width: w.q, textAlign: "right" } }, "Qtd."),
    h(Text, { style: { width: w.p, textAlign: "right" } }, "Preço"),
    model.hasItemDiscount ? h(Text, { style: { width: w.x, textAlign: "right" } }, "Desc.") : null,
    h(Text, { style: { width: w.t, textAlign: "right" } }, "Total")
  );

  const rows = model.items.map((item, index) =>
    h(
      View,
      { key: `i${index}`, style: index % 2 === 1 ? [styles.tr, styles.trAlt] : styles.tr, wrap: false },
      h(Text, { style: { width: w.n } }, item.position),
      h(Text, { style: { width: w.d, paddingRight: 6 } }, item.description),
      h(Text, { style: { width: w.q, textAlign: "right" } }, `${item.quantity} ${item.unit}`),
      h(Text, { style: { width: w.p, textAlign: "right" } }, item.unitPrice),
      model.hasItemDiscount ? h(Text, { style: { width: w.x, textAlign: "right" } }, item.discount) : null,
      h(Text, { style: { width: w.t, textAlign: "right" } }, item.total)
    )
  );

  const totals = h(
    View,
    { style: styles.totals, wrap: false },
    h(View, { style: styles.totalRow }, h(Text, null, "Subtotal"), h(Text, null, model.totals.subtotal)),
    model.totals.discount ? h(View, { style: styles.totalRow }, h(Text, null, "Desconto"), h(Text, null, `- ${model.totals.discount}`)) : null,
    h(View, { style: styles.totalFinal }, h(Text, null, "Total"), h(Text, null, model.totals.total))
  );

  const sections = model.sections.map((section, index) =>
    h(View, { key: `s${index}`, style: styles.section, wrap: false }, h(Text, { style: styles.sectionTitle }, section.title), h(Text, null, section.text))
  );

  const pix = model.pix
    ? h(
        View,
        { style: styles.pix, wrap: false },
        qr ? h(Image, { src: { data: qr, format: "png" }, style: styles.pixQr }) : null,
        h(
          View,
          { style: styles.pixInfo },
          h(Text, { style: styles.pixTitle }, "Pague com Pix"),
          h(Text, { style: { marginTop: 2 } }, `Escaneie o QR Code com o app do seu banco. O valor de ${model.pix.amount} já vem preenchido.`),
          h(Text, { style: { marginTop: 3, color: MUTED, fontSize: 8.5 } }, `Favorecido: ${model.pix.receiver}  |  Chave (${model.pix.keyLabel}): ${model.pix.key}`),
          h(Text, { style: { marginTop: 5, fontSize: 8, ...BOLD } }, "Pix copia e cola:"),
          h(Text, { style: styles.pixCode }, model.pix.payload)
        )
      )
    : null;

  const acceptance = model.acceptance
    ? h(
        View,
        { style: styles.accept, wrap: false },
        h(Text, { style: styles.sectionTitle }, "Aceite da proposta"),
        h(Text, null, `Declaro que li e aceito as condições deste orçamento (${model.number}), no valor total de ${model.totals.total}.`),
        h(
          View,
          { style: styles.acceptRow },
          h(Text, { style: styles.signature }, `${model.acceptance.customerName} - Cliente`),
          h(Text, { style: styles.signature }, `${model.acceptance.companyName} - Empresa`)
        ),
        h(Text, { style: { marginTop: 8, fontSize: 8.5, color: MUTED } }, "Data do aceite: ____ / ____ / ________")
      )
    : null;

  const brand = brandLogo();
  const footer = h(
    View,
    { style: styles.footer, fixed: true },
    h(
      View,
      { style: styles.footerLine },
      h(Text, { style: styles.footerText }, model.footer ?? `Orçamento ${model.number} - válido até ${model.validUntil}`)
    ),
    h(
      View,
      { style: styles.brandRow },
      brand ? h(Image, { src: { data: brand, format: "png" }, style: styles.brandLogo }) : null,
      h(
        Text,
        { style: styles.brandText },
        `${BRAND_LEAD} `,
        h(Text, { style: styles.brandName }, BRAND_NAME),
        `  |  ${BRAND_TAGLINE}  |  ${BRAND_SITE}`
      )
    )
  );

  // O "Página X de Y" (texto dinâmico) fica FORA da linha do rodapé: dentro dela o react-pdf descarta a linha inteira
  // (inclusive o texto do rodapé da empresa). Posicionado na mesma altura da linha, à direita.
  const pageNumber = pageNumbers
    ? h(
        View,
        { style: styles.pageNumberBox, fixed: true },
        h(Text, { style: styles.pageNumber, render: ({ pageNumber: page, totalPages }: { pageNumber: number; totalPages: number }) => `Página ${page} de ${totalPages}` })
      )
    : null;

  return h(
    Document,
    { title: `Orçamento ${model.number}`, author: model.company.name, creator: "Prime Ges", producer: "Prime Ges" },
    h(
      Page,
      { size: "A4", style: styles.page },
      model.isDraft ? h(Text, { style: styles.watermark, fixed: true }, "RASCUNHO") : null,
      h(
        View,
        { style: styles.body },
        header,
        titleRow,
        model.title ? h(Text, { style: styles.subject }, model.title) : null,
        model.intro ? h(Text, { style: styles.intro }, model.intro) : null,
        customer,
        h(View, { style: styles.table }, headRow, ...rows),
        totals,
        ...sections,
        pix,
        acceptance
      ),
      footer,
      pageNumber
    )
  );
}

/** QR Code do Pix como PNG; se falhar, o PDF sai sem a imagem e o "copia e cola" continua legível. */
async function pixQrPng(payload: string): Promise<Buffer | null> {
  try {
    return await QRCode.toBuffer(payload, { errorCorrectionLevel: "M", margin: 1, width: 360, type: "png" });
  } catch {
    return null;
  }
}

/**
 * Gera os bytes do PDF. O "Página X de Y" usa o recurso de texto dinâmico do react-pdf, que (verificado nos testes) falha a
 * partir de ~11 páginas com "unsupported number"; nesse caso o PDF é gerado de novo sem a numeração, em vez de dar erro.
 */
export async function renderQuotePdf(model: QuotePdfModel, logo: PdfLogo | null): Promise<Buffer> {
  const qr = model.pix ? await pixQrPng(model.pix.payload) : null;
  try {
    return await renderToBuffer(buildQuotePdfElement(model, logo, true, qr) as Parameters<typeof renderToBuffer>[0]);
  } catch {
    return await renderToBuffer(buildQuotePdfElement(model, logo, false, qr) as Parameters<typeof renderToBuffer>[0]);
  }
}
