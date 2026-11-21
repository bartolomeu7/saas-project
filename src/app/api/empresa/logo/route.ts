import { NextResponse } from "next/server";
import { getCurrentCompany, loadCompanyLogo } from "@/lib/companies/queries";
import { ACCOUNT_BLOCKED_MESSAGE, AccountInactiveError } from "@/lib/auth/account-status";

export const dynamic = "force-dynamic";

/**
 * Logo da empresa do usuário logado (a empresa vem da sessão, nunca da URL). Serve a imagem gravada no banco com cabeçalhos
 * que impedem o navegador de tratá-la como página ou script (nosniff + sandbox) e com ETag, para recarregar só quando mudar.
 */
export async function GET(request: Request) {
  let current;
  try {
    current = await getCurrentCompany();
  } catch (error) {
    if (error instanceof AccountInactiveError) return NextResponse.json({ error: ACCOUNT_BLOCKED_MESSAGE }, { status: 403 });
    throw error;
  }
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const logo = await loadCompanyLogo(current.company.id);
  if (!logo) return NextResponse.json({ error: "Sem logo." }, { status: 404, headers: { "cache-control": "no-store" } });

  const etag = `"${Date.parse(logo.updatedAt) || 0}-${logo.bytes.length}"`;
  const headers = {
    "cache-control": "private, max-age=0, must-revalidate",
    etag,
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
    "content-disposition": "inline",
  };
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });

  return new NextResponse(new Uint8Array(logo.bytes), { status: 200, headers: { ...headers, "content-type": logo.contentType, "content-length": String(logo.bytes.length) } });
}
