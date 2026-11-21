/**
 * Desenho do PDF do orçamento (@react-pdf/renderer). Escrito com React.createElement num arquivo ".ts" (sem JSX) para os testes
 * de Node conseguirem importar e gerar o PDF de verdade. Só posiciona: o conteúdo vem pronto de pdf-model.ts.
 * Fonte padrão (Helvetica) — por isso os textos passam por pdfSafeText antes.
 */
import React from "react";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { QuotePdfModel } from "./pdf-model.ts";

const h = React.createElement;

const INK = "#1f2937";
const MUTED = "#6b7280";
const LINE = "#d1d5db";
const SOFT = "#f3f4f6";

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 60, paddingHorizontal: 36, fontFamily: "Helvetica", fontSize: 9.5, color: INK, lineHeight: 1.35 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: LINE },
  logo: { maxWidth: 130, maxHeight: 60, objectFit: "contain" },
  companyBox: { flexGrow: 1, flexShrink: 1, paddingLeft: 12, alignItems: "flex-end" },
  companyName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  small: { fontSize: 8.5, color: MUTED, textAlign: "right" },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  draft: { fontSize: 9, color: "#b45309", fontFamily: "Helvetica-Bold", marginTop: 2 },
  meta: { fontSize: 9, color: MUTED, textAlign: "right" },
  subject: { marginTop: 6, fontSize: 11 },
  box: { marginTop: 14, padding: 10, backgroundColor: SOFT, borderRadius: 3 },
  boxLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase", marginBottom: 3, fontFamily: "Helvetica-Bold" },
  customerName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  table: { marginTop: 14 },
  th: { flexDirection: "row", backgroundColor: INK, color: "#ffffff", paddingVertical: 5, paddingHorizontal: 4, fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: LINE },
  cellNum: { textAlign: "right" },
  totals: { marginTop: 10, alignSelf: "flex-end", width: 210 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalFinal: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, paddingHorizontal: 6, marginTop: 4, backgroundColor: INK, color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 12 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 8.5, color: MUTED, textTransform: "uppercase", fontFamily: "Helvetica-Bold", marginBottom: 3 },
  footer: { position: "absolute", left: 36, right: 36, bottom: 24, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: MUTED, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6 },
  footerText: { flexGrow: 1, flexShrink: 1, paddingRight: 10 },
});

export interface PdfLogo {
  data: Buffer;
  format: "png" | "jpg";
}

/** Larguras (em %) das colunas; com desconto por item aparece a coluna "Desc.". */
function columns(withDiscount: boolean) {
  return withDiscount ? { n: "5%", d: "37%", q: "12%", p: "15%", x: "14%", t: "17%" } : { n: "5%", d: "45%", q: "13%", p: "17%", x: "0%", t: "20%" };
}

export function buildQuotePdfElement(model: QuotePdfModel, logo: PdfLogo | null, pageNumbers = true) {
  const w = columns(model.hasItemDiscount);

  const header = h(
    View,
    { style: styles.header },
    logo ? h(Image, { src: { data: logo.data, format: logo.format }, style: styles.logo }) : h(View, null),
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
    h(View, null, h(Text, { style: styles.title }, `Orçamento ${model.number}`), model.isDraft ? h(Text, { style: styles.draft }, "RASCUNHO - ainda não enviado ao cliente") : null),
    h(View, null, h(Text, { style: styles.meta }, `Emitido em ${model.issuedOn}`), h(Text, { style: styles.meta }, `Válido até ${model.validUntil}`))
  );

  const customer = h(
    View,
    { style: styles.box },
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
      { key: `i${index}`, style: styles.tr, wrap: false },
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

  const footer = h(
    View,
    { style: styles.footer, fixed: true },
    h(Text, { style: styles.footerText }, model.footer ?? `Orçamento ${model.number} - válido até ${model.validUntil}`),
    pageNumbers ? h(Text, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Página ${pageNumber} de ${totalPages}` }) : null
  );

  return h(
    Document,
    { title: `Orçamento ${model.number}`, author: model.company.name, creator: "Prime Ges", producer: "Prime Ges" },
    h(
      Page,
      { size: "A4", style: styles.page },
      header,
      titleRow,
      model.title ? h(Text, { style: styles.subject }, model.title) : null,
      customer,
      h(View, { style: styles.table }, headRow, ...rows),
      totals,
      ...sections,
      footer
    )
  );
}

/**
 * Gera os bytes do PDF. O "Página X de Y" usa o recurso de texto dinâmico do react-pdf, que (verificado nos testes) falha a
 * partir de ~11 páginas com "unsupported number"; nesse caso o PDF é gerado de novo sem a numeração, em vez de dar erro.
 */
export async function renderQuotePdf(model: QuotePdfModel, logo: PdfLogo | null): Promise<Buffer> {
  try {
    return await renderToBuffer(buildQuotePdfElement(model, logo, true) as Parameters<typeof renderToBuffer>[0]);
  } catch {
    return await renderToBuffer(buildQuotePdfElement(model, logo, false) as Parameters<typeof renderToBuffer>[0]);
  }
}
