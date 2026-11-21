import { NextResponse } from "next/server";
import { getCurrentCompany, getQuoteStyle, loadCompanyLogo } from "@/lib/companies/queries";
import { ACCOUNT_BLOCKED_MESSAGE, AccountInactiveError } from "@/lib/auth/account-status";
import { getQuoteDetail } from "@/lib/quotes/queries";
import { buildQuotePdfModel } from "@/lib/quotes/pdf-model";
import { renderQuotePdf } from "@/lib/quotes/pdf-document";
import { logoForPdf } from "@/lib/quotes/logo";
import { quoteFileName } from "@/lib/quotes/rules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PDF do orçamento. A empresa vem da sessão (nunca da URL) e o orçamento é buscado COM o filtro da empresa:
 * pedir o id de outra empresa devolve 404, igual a um id que não existe.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  let current;
  try {
    current = await getCurrentCompany();
  } catch (error) {
    if (error instanceof AccountInactiveError) return NextResponse.json({ error: ACCOUNT_BLOCKED_MESSAGE }, { status: 403 });
    throw error;
  }
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await context.params;
  const detail = await getQuoteDetail(current.company.id, id);
  if (!detail) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });

  // react-pdf só desenha PNG e JPG: o logo WEBP (aceito no cadastro) é convertido para PNG; se falhar, sai só o nome da empresa
  const [stored, style] = await Promise.all([loadCompanyLogo(current.company.id), getQuoteStyle(current.company.id)]);
  const logo = await logoForPdf(stored);

  let bytes: Buffer;
  try {
    const model = buildQuotePdfModel(current.company, detail.quote, detail.items, style);
    bytes = await renderQuotePdf(model, logo);
  } catch (error) {
    console.error("[orcamento] falha ao gerar o PDF:", error instanceof Error ? error.message : error);
    // logo corrompido não pode impedir o orçamento: tenta de novo sem ele
    if (!logo) return NextResponse.json({ error: "Não foi possível gerar o PDF agora. Tente novamente." }, { status: 500 });
    try {
      bytes = await renderQuotePdf(buildQuotePdfModel(current.company, detail.quote, detail.items, style), null);
    } catch {
      return NextResponse.json({ error: "Não foi possível gerar o PDF agora. Tente novamente." }, { status: 500 });
    }
  }

  const fileName = quoteFileName(detail.quote.number, detail.quote.customer_name);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(bytes.length),
      "content-disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
