import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { createSessionClient } from "@/lib/supabase/server";
import { ACCOUNT_BLOCKED_MESSAGE, AccountInactiveError } from "@/lib/auth/account-status";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Baixa o anexo de um cliente da empresa do usuário logado (a empresa vem da sessão; a RLS repete a checagem). Sempre
 * como download, com cabeçalhos que impedem o navegador de tratar o arquivo como página ou script.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let current;
  try {
    current = await getCurrentCompany();
  } catch (error) {
    if (error instanceof AccountInactiveError) return NextResponse.json({ error: ACCOUNT_BLOCKED_MESSAGE }, { status: 403 });
    throw error;
  }
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const notFound = () => NextResponse.json({ error: "Documento não encontrado." }, { status: 404, headers: { "cache-control": "no-store" } });
  if (!UUID.test(id)) return notFound();

  const supabase = await createSessionClient();
  const { data: document } = await supabase
    .from("customer_documents")
    .select("file_name, file_type")
    .eq("id", id)
    .eq("company_id", current.company.id)
    .maybeSingle();
  if (!document) return notFound();

  const { data: file } = await supabase
    .from("customer_document_files")
    .select("data_base64")
    .eq("document_id", id)
    .eq("company_id", current.company.id)
    .maybeSingle();
  if (!file) return notFound();

  const bytes = new Uint8Array(Buffer.from(file.data_base64, "base64"));
  return new NextResponse(bytes, {
    headers: {
      "content-type": document.file_type,
      "content-length": String(bytes.length),
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.file_name)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
