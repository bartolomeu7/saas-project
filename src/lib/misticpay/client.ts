import "server-only";

/**
 * Cliente HTTP puro da API da MisticPay (docs.misticpay.com, lida em 22/11/2026). Só o que o Prime Ges usa: cobrança Pix
 * (`POST /api/transactions/create`) e consulta de transação (`POST /api/transactions/check`). Nenhum endpoint ou campo inventado.
 *
 * Autenticação: chave de acesso `pk_…` / `sk_…` no cabeçalho `Authorization: Basic base64(client_id:client_secret)`, com os
 * escopos TRANSACTION_CREATE e TRANSACTION_READ (os demais não são necessários — crie a chave só com esses dois). A API aceita
 * apenas os IPs autorizados na conta (API → IPs autorizados), quando a lista estiver preenchida. Valores em REAIS (não centavos).
 * Não há ambiente de testes. A MisticPay NÃO assina os webhooks: por isso o webhook daqui só dispara uma consulta ao `check`
 * (fonte da verdade) antes de liberar qualquer acesso. Nunca loga corpo, cabeçalhos nem segredo.
 */

export type MisticPayConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
};

export class MisticPayError extends Error {
  status: number;
  /** Código estável devolvido pela MisticPay (ex.: IP_NOT_ALLOWED, API_SCOPE_DENIED), quando houver. */
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "MisticPayError";
    this.status = status;
    this.code = code;
  }
}

/** Tempo máximo de cada chamada. Estourou => MisticPayError(status 0): quem chama trata como "resultado desconhecido". */
export const MISTICPAY_TIMEOUT_MS = 12_000;
const DEFAULT_BASE_URL = "https://api.misticpay.com";

export function readConfig(env: Record<string, string | undefined> = process.env): MisticPayConfig {
  const clientId = env.MISTICPAY_CLIENT_ID?.trim();
  const clientSecret = env.MISTICPAY_CLIENT_SECRET?.trim();
  if (!clientId) throw new Error("MISTICPAY_CLIENT_ID não configurada no ambiente.");
  if (!clientSecret) throw new Error("MISTICPAY_CLIENT_SECRET não configurada no ambiente.");
  const baseUrl = (env.MISTICPAY_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { baseUrl, clientId, clientSecret };
}

async function rawFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(MISTICPAY_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new MisticPayError("Tempo esgotado ao contatar a MisticPay.", 0);
    }
    throw new MisticPayError("Falha de rede ao contatar a MisticPay.", 0);
  }
}

async function errorFrom(response: Response): Promise<MisticPayError> {
  let message = `MisticPay respondeu ${response.status}`;
  let code: string | null = null;
  try {
    const body = (await response.json()) as { message?: unknown; code?: unknown };
    if (typeof body.message === "string" && body.message.trim() !== "") message = body.message.slice(0, 300);
    if (typeof body.code === "string") code = body.code.slice(0, 60);
  } catch {
    // corpo que não é JSON: mantém a mensagem genérica com o status
  }
  return new MisticPayError(message, response.status, code);
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const config = readConfig();
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await rawFetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Basic ${basic}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await errorFrom(response);
  try {
    return (await response.json()) as T;
  } catch {
    // 2xx com corpo ilegível não é resposta confiável: nunca vira "pago" nem "criado"
    throw new MisticPayError("Resposta inválida da MisticPay.", response.status);
  }
}

export interface PixChargeInput {
  /** Valor em REAIS (ex.: 89 ou 4.55). */
  amount: number;
  /** Identificador do Prime Ges para esta cobrança (id do pagamento): volta no webhook e serve de chave de consulta. */
  transactionId: string;
  description: string;
  payerName: string;
  /** Só dígitos, sem formatação. A documentação cita CPF; CNPJ não é mencionado (ver docs/MISTICPAY_INTEGRACAO.md). */
  payerDocument: string;
  /** URL pública do nosso webhook (com o token secreto). */
  webhookUrl?: string;
}

export interface PixCharge {
  /** Identificador da transação do lado da MisticPay (a doc devolve como texto). */
  transactionId: string;
  /** Código "copia e cola" (serve também para gerar o QR Code). */
  pixCode: string;
}

/** POST /api/transactions/create — cobrança Pix. */
export async function createPixCharge(input: PixChargeInput): Promise<PixCharge> {
  const body = await call<{ data?: { transactionId?: unknown; copyPaste?: unknown } }>("/api/transactions/create", {
    amount: input.amount,
    payerName: input.payerName,
    payerDocument: input.payerDocument,
    transactionId: input.transactionId,
    description: input.description,
    ...(input.webhookUrl ? { projectWebhook: input.webhookUrl } : {}),
  });
  const id = body.data?.transactionId;
  const code = body.data?.copyPaste;
  const textId = typeof id === "string" ? id.trim() : typeof id === "number" && Number.isFinite(id) ? String(id) : "";
  if (textId === "" || typeof code !== "string" || code.trim() === "") throw new MisticPayError("Resposta inválida da MisticPay.", 200);
  return { transactionId: textId, pixCode: code };
}

export interface TransactionSnapshot {
  /** PENDENTE | COMPLETO | FALHA (a listagem ainda cita CANCELADO, DEVOLVIDO e DEVOLVIDO_PARCIAL). */
  state: string;
  /** Valor da transação em REAIS. */
  value: number | null;
  fee: number | null;
  /** DEPOSITO (entrada) ou RETIRADA (saque). */
  type: string | null;
}

/**
 * POST /api/transactions/check — FONTE DA VERDADE do status. Aceita o identificador da transação (o da resposta de criação
 * ou o `transactionId` enviado por nós). A resposta pode ficar em cache por alguns segundos enquanto está pendente.
 */
export async function checkTransaction(transactionId: string): Promise<TransactionSnapshot> {
  const body = await call<{ transaction?: Record<string, unknown> }>("/api/transactions/check", { transactionId });
  const t = body.transaction;
  if (!t || typeof t.transactionState !== "string" || t.transactionState === "") throw new MisticPayError("Resposta inválida da MisticPay.", 200);
  const money = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    state: t.transactionState,
    value: money(t.value),
    fee: money(t.fee),
    type: typeof t.transactionType === "string" ? t.transactionType : null,
  };
}
