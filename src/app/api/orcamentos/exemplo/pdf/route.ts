import { NextResponse } from "next/server";
import { getCurrentCompany, getQuoteStyle, loadCompanyLogo } from "@/lib/companies/queries";
import { ACCOUNT_BLOCKED_MESSAGE, AccountInactiveError } from "@/lib/auth/account-status";
import { buildQuotePdfModel, type PdfItemInput, type PdfQuoteInput } from "@/lib/quotes/pdf-model";
import { renderQuotePdf } from "@/lib/quotes/pdf-document";
import { logoForPdf } from "@/lib/quotes/logo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PDF de EXEMPLO com os dados da própria empresa (logo, cor, modelo, Pix) e um cliente fictício, para conferir a aparência
 * em Configurações → Empresa sem criar um orçamento. Não grava nada no banco.
 */
export async function GET() {
  let current;
  try {
    current = await getCurrentCompany();
  } catch (error) {
    if (error instanceof AccountInactiveError) return NextResponse.json({ error: ACCOUNT_BLOCKED_MESSAGE }, { status: 403 });
    throw error;
  }
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const today = new Date();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const validUntil = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000);

  const quote: PdfQuoteInput = {
    number: "ORC-EXEMPLO",
    status: "sent",
    customer_name: "Maria da Silva (cliente de exemplo)",
    customer_document: null,
    customer_phone: "(11) 91234-5678",
    customer_email: "maria@exemplo.com",
    customer_address: null,
    title: "Exemplo de proposta",
    issued_on: iso(today),
    valid_until: iso(validUntil),
    subtotal: 1340.5,
    discount_amount: 40.5,
    total_amount: 1300,
    payment_terms: "50% de entrada e 50% na entrega.\nPix ou cartão em até 3x.",
    delivery_terms: "10 dias úteis após a aprovação.",
    notes: "Este é um documento de exemplo, sem valor comercial.",
    footer: "Exemplo gerado pelo Prime Ges",
  };
  const items: PdfItemInput[] = [
    { position: 1, description: "Serviço de exemplo com descrição um pouco mais longa para ver a quebra de linha", unit: "un", quantity: 2, unit_price: 500, discount_amount: 25, total_amount: 975 },
    { position: 2, description: "Produto de exemplo", unit: "un", quantity: 3, unit_price: 120.25, discount_amount: 0, total_amount: 360.75 },
    { position: 3, description: "Mão de obra", unit: "h", quantity: 1, unit_price: 4.75, discount_amount: 0, total_amount: 4.75 },
  ];

  const [stored, style] = await Promise.all([loadCompanyLogo(current.company.id), getQuoteStyle(current.company.id)]);
  const logo = await logoForPdf(stored);

  let bytes: Buffer;
  try {
    bytes = await renderQuotePdf(buildQuotePdfModel(current.company, quote, items, style), logo);
  } catch (error) {
    console.error("[orcamento] falha ao gerar o PDF de exemplo:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Não foi possível gerar o PDF de exemplo agora. Tente novamente." }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(bytes.length),
      "content-disposition": 'inline; filename="Orcamento-exemplo.pdf"',
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
