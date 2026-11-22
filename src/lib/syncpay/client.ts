import "server-only";

/**
 * Cliente HTTP puro da API da SyncPay (docs.syncpayments.com.br, lida em 21/11/2026). Só o que o Prime Ges usa:
 * token de acesso, cobrança Pix (cash-in), cobrança no cartão com token de uso único e consulta de transação.
 * Nenhum endpoint ou campo inventado; tudo conforme a documentação.
 *
 * Autenticação: `POST /api/partner/v1/auth-token` {client_id, client_secret} → Bearer válido por 1 h. O token é guardado
 * em memória e reaproveitado (a doc pede para não gerar um por requisição; limite de 500 req/min). 401 → renova uma vez.
 * A API só aceita IPs autorizados no painel (Developer → API → IPs Autorizados).
 * Valores são em REAIS (mínimo 1,00). Nunca loga corpo, cabeçalhos, token ou segredo.
 */

export type SyncPayConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
};

export class SyncPayError extends Error {
  status: number;
  /** Código de negócio devolvido pela SyncPay (ex.: DUPLICATE_CARD_TOKEN), quando houver. */
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "SyncPayError";
    this.status = status;
    this.code = code;
  }
}

/** Tempo máximo de cada chamada. Estourou => SyncPayError(status 0): quem chama trata como "resultado desconhecido". */
export const SYNCPAY_TIMEOUT_MS = 12_000;
const DEFAULT_BASE_URL = "https://api.syncpayments.com.br";

export function readConfig(env: Record<string, string | undefined> = process.env): SyncPayConfig {
  const clientId = env.SYNCPAY_CLIENT_ID?.trim();
  const clientSecret = env.SYNCPAY_CLIENT_SECRET?.trim();
  if (!clientId) throw new Error("SYNCPAY_CLIENT_ID não configurada no ambiente.");
  if (!clientSecret) throw new Error("SYNCPAY_CLIENT_SECRET não configurada no ambiente.");
  const baseUrl = (env.SYNCPAY_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { baseUrl, clientId, clientSecret };
}

type CachedToken = { value: string; expiresAtMs: number };
let cachedToken: CachedToken | null = null;
let tokenInFlight: Promise<string> | null = null;

/** Só para testes. */
export function resetTokenCache(): void {
  cachedToken = null;
  tokenInFlight = null;
}

async function rawFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(SYNCPAY_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new SyncPayError("Tempo esgotado ao contatar a SyncPay.", 0);
    }
    throw new SyncPayError("Falha de rede ao contatar a SyncPay.", 0);
  }
}

async function errorFrom(response: Response): Promise<SyncPayError> {
  let message = `SyncPay respondeu ${response.status}`;
  let code: string | null = null;
  try {
    const body = (await response.json()) as { message?: unknown; error?: unknown; error_code?: unknown; error_description?: unknown };
    const found = [body.message, body.error_description, body.error].find((v) => typeof v === "string" && v.trim() !== "");
    if (typeof found === "string") message = found.slice(0, 300);
    if (typeof body.error_code === "string") code = body.error_code.slice(0, 60);
  } catch {
    // corpo que não é JSON: mantém a mensagem genérica com o status
  }
  return new SyncPayError(message, response.status, code);
}

async function requestToken(config: SyncPayConfig): Promise<CachedToken> {
  const response = await rawFetch(`${config.baseUrl}/api/partner/v1/auth-token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret }),
  });
  if (!response.ok) throw await errorFrom(response);

  let body: { access_token?: unknown; expires_in?: unknown };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new SyncPayError("Resposta inválida da SyncPay.", response.status);
  }
  if (typeof body.access_token !== "string" || body.access_token === "") throw new SyncPayError("Resposta inválida da SyncPay.", response.status);
  const seconds = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3600;
  return { value: body.access_token, expiresAtMs: Date.now() + seconds * 1000 };
}

/** Token em cache; renova quando falta menos de 1 minuto. Chamadas simultâneas dividem a mesma renovação. */
export async function getAccessToken(force = false): Promise<string> {
  if (!force && cachedToken && cachedToken.expiresAtMs - Date.now() > 60_000) return cachedToken.value;
  if (!tokenInFlight) {
    const config = readConfig();
    tokenInFlight = requestToken(config)
      .then((token) => {
        cachedToken = token;
        return token.value;
      })
      .finally(() => {
        tokenInFlight = null;
      });
  }
  return tokenInFlight;
}

async function authed<T>(path: string, init: RequestInit): Promise<T> {
  const config = readConfig();
  const call = async (token: string) =>
    rawFetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });

  let response = await call(await getAccessToken());
  if (response.status === 401) {
    // token expirado/revogado: renova UMA vez e repete (a doc recomenda exatamente isso)
    response = await call(await getAccessToken(true));
  }
  if (!response.ok) throw await errorFrom(response);

  try {
    return (await response.json()) as T;
  } catch {
    // 2xx com corpo ilegível não é resposta confiável: nunca vira "pago" nem "criado"
    throw new SyncPayError("Resposta inválida da SyncPay.", response.status);
  }
}

export interface Buyer {
  name: string;
  /** Só dígitos: CPF (11) ou CNPJ (14), já validado. */
  document: string;
  email: string;
  /** Só dígitos com DDD (10 ou 11), sem 55. */
  phone: string;
}

export interface PixCharge {
  /** Código "copia e cola" (serve também como QR Code). */
  pixCode: string;
  /** Identificador da transação para conciliar com o webhook. */
  identifier: string;
}

/** POST /cash-in — cobrança Pix. O aviso de pagamento vem pelo webhook `transaction` cadastrado na conta (não por webhook_url). */
export async function createPixCharge(input: { amount: number; description: string; buyer: Buyer }): Promise<PixCharge> {
  const body = await authed<{ pix_code?: unknown; identifier?: unknown }>("/api/partner/v1/cash-in", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amount,
      description: input.description,
      client: { name: input.buyer.name, document: input.buyer.document, email: input.buyer.email, phone: input.buyer.phone },
    }),
  });
  if (typeof body.pix_code !== "string" || body.pix_code === "" || typeof body.identifier !== "string" || body.identifier === "") {
    throw new SyncPayError("Resposta inválida da SyncPay.", 200);
  }
  return { pixCode: body.pix_code, identifier: body.identifier };
}

export interface CardChargeInput {
  amount: number;
  description: string;
  /** Token de uso único (`card_token.…`) gerado pelo iFrame da SyncPay. */
  cardToken: string;
  buyer: Buyer;
  device: { ip: string; userAgent: string; pageUrl: string; metadata: Record<string, string> };
}

/**
 * POST /credit-card — cobra à vista com o token do iFrame. `200` quer dizer só "submetida": o resultado vem pelo webhook.
 * `transactionId` pode vir null em casos raros (a cobrança foi feita; NÃO retentar). A rota não tem idempotência: um token
 * novo para o mesmo pedido cria OUTRA cobrança — quem chama garante uma única tentativa em andamento por pagamento.
 */
export async function createCardCharge(input: CardChargeInput): Promise<{ transactionId: string | null }> {
  const body = await authed<{ data?: { transaction_id?: unknown } }>("/api/partner/v1/credit-card", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amount,
      description: input.description,
      installments: 1,
      card: { token: input.cardToken },
      client: {
        name: input.buyer.name,
        email: input.buyer.email,
        phone: input.buyer.phone,
        document: { type: input.buyer.document.length === 14 ? "cnpj" : "cpf", number: input.buyer.document },
      },
      device: { ip: input.device.ip, user_agent: input.device.userAgent, page_url: input.device.pageUrl, metadata: input.device.metadata },
    }),
  });
  const id = body.data?.transaction_id;
  return { transactionId: typeof id === "string" && id !== "" ? id : null };
}

export interface TransactionSnapshot {
  referenceId: string;
  status: string;
  amount: number | null;
  endToEndId: string | null;
  description: string | null;
}

/**
 * GET /api/partner/v2/transactions/{reference_id} — CONTINGÊNCIA. Cada transação aceita no máximo 5 consultas (V1+V2 somadas;
 * a 6ª dá 429 mesmo com a transação existindo). Quem chama controla o contador (subscription_payments.status_checks).
 */
export async function getTransaction(referenceId: string): Promise<TransactionSnapshot> {
  const body = await authed<{ data?: { transaction?: Record<string, unknown> } }>(`/api/partner/v2/transactions/${encodeURIComponent(referenceId)}`, { method: "GET" });
  const t = body.data?.transaction;
  if (!t || typeof t.reference_id !== "string" || typeof t.status !== "string") throw new SyncPayError("Resposta inválida da SyncPay.", 200);
  const amount = typeof t.amount === "number" && Number.isFinite(t.amount) ? t.amount : typeof t.amount === "string" && t.amount.trim() !== "" && Number.isFinite(Number(t.amount)) ? Number(t.amount) : null;
  return {
    referenceId: t.reference_id,
    status: t.status,
    amount,
    endToEndId: typeof t.end_to_end_id === "string" && t.end_to_end_id !== "" ? t.end_to_end_id : null,
    description: typeof t.description === "string" ? t.description : null,
  };
}

/** O cartão (iFrame) só é oferecido com a chave pública e a liberação de cartão configuradas. */
export function cardCheckoutConfig(env: Record<string, string | undefined> = process.env): { enabled: boolean; publicKey: string | null } {
  const key = env.SYNCPAY_PUBLIC_KEY?.trim() ?? "";
  const enabled = env.SYNCPAY_CARD_ENABLED === "1" && /^pk_live_[A-Za-z0-9_-]+$/.test(key);
  return { enabled, publicKey: enabled ? key : null };
}
