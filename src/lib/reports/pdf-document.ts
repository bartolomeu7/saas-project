/**
 * Desenho do PDF dos Relatórios. Só posiciona: o conteúdo vem pronto de document.ts. Mesma fábrica de elementos e
 * mesma fonte do PDF de orçamento (ver lá o porquê do `h` próprio); arquivo ".ts" para o teste gerar o PDF de verdade.
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { h, PDF_FONT_FAMILY } from "../quotes/pdf-document.ts";
import { pdfSafeText } from "../quotes/rules.ts";
import { cellText, type DocumentSection, type ReportDocument } from "./document.ts";

const BOLD = { fontFamily: PDF_FONT_FAMILY, fontWeight: 700 } as const;

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 48, paddingHorizontal: 32, fontFamily: PDF_FONT_FAMILY, fontSize: 9, color: "#1f2937" },
  company: { fontSize: 9, color: "#6b7280", marginBottom: 2 },
  title: { fontSize: 16, ...BOLD, lineHeight: 1.25 },
  subtitle: { fontSize: 9, color: "#374151", marginTop: 3 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 10.5, ...BOLD, marginBottom: 4, lineHeight: 1.3 },
  head: { flexDirection: "row", backgroundColor: "#e5e7eb", paddingVertical: 4, paddingHorizontal: 4, fontSize: 8, ...BOLD },
  row: { flexDirection: "row", paddingVertical: 3.5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: "#d1d5db" },
  first: { flexGrow: 3, flexShrink: 1, flexBasis: 0, paddingRight: 6 },
  number: { flexGrow: 1, flexShrink: 1, flexBasis: 0, textAlign: "right", paddingLeft: 4 },
  empty: { paddingVertical: 5, paddingHorizontal: 4, color: "#6b7280" },
  note: { marginTop: 4, fontSize: 8, color: "#6b7280" },
  footer: { position: "absolute", left: 32, right: 32, bottom: 22, fontSize: 7.5, color: "#6b7280" },
  pageNumberBox: { position: "absolute", left: 32, right: 32, bottom: 22, flexDirection: "row", justifyContent: "flex-end" },
  pageNumber: { fontSize: 7.5, color: "#6b7280", textAlign: "right", width: 90 },
});

const text = (style: unknown, value: string, key?: number) => h(Text, { style, key }, pdfSafeText(value) || "-");

function sectionBlock(section: DocumentSection, index: number) {
  const cell = (value: string, column: number) => text(column === 0 ? styles.first : styles.number, value, column);
  return h(
    View,
    { style: styles.section, key: index },
    // título e cabeçalho não ficam sozinhos no pé da página
    h(View, { wrap: false, minPresenceAhead: 30 }, text(styles.sectionTitle, section.title), h(View, { style: styles.head }, ...section.columns.map(cell))),
    ...(section.rows.length
      ? section.rows.map((row, line) => h(View, { style: styles.row, wrap: false, key: line }, ...row.map((value, column) => cell(cellText(value), column))))
      : [h(Text, { style: styles.empty, key: "vazio" }, "Nada neste período.")]),
    section.note ? text(styles.note, section.note) : null
  );
}

export function buildReportPdfElement(document: ReportDocument, company: string, generatedAt: string, pageNumbers = true) {
  // tabela larga (a da Agenda) pede a folha deitada
  const landscape = document.sections.some((section) => section.columns.length > 6);
  return h(
    Document,
    { title: `${document.title} - ${company}`, author: company, creator: "Prime Ges", producer: "Prime Ges" },
    h(
      Page,
      { size: "A4", orientation: landscape ? "landscape" : "portrait", style: styles.page },
      h(View, null, text(styles.company, company), text(styles.title, `Relatório - ${document.title}`), text(styles.subtitle, document.subtitle)),
      ...document.sections.map(sectionBlock),
      h(View, { style: styles.footer, fixed: true }, text(undefined, `Prime Ges | gerado em ${generatedAt}`)),
      pageNumbers
        ? h(
            View,
            { style: styles.pageNumberBox, fixed: true },
            h(Text, { style: styles.pageNumber, render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Página ${pageNumber} de ${totalPages}` })
          )
        : null
    )
  );
}

/** Como no orçamento: a numeração dinâmica falha em PDFs longos; nesse caso sai sem ela, em vez de dar erro. */
export async function renderReportPdf(document: ReportDocument, company: string, generatedAt: string): Promise<Buffer> {
  const render = (pageNumbers: boolean) =>
    renderToBuffer(buildReportPdfElement(document, company, generatedAt, pageNumbers) as Parameters<typeof renderToBuffer>[0]);
  try {
    return await render(true);
  } catch {
    return await render(false);
  }
}
