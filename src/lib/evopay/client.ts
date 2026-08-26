import "server-only";

/**
 * Cliente HTTP puro da API da EvoPay (docs.evopay.cash) — só os 2
 * endpoints realmente usados nesta fase (criar e consultar cobrança
 * Pix). Nenhum endpoint/campo inventado; tudo conforme documentado.
 *
 * Base URL confirmada: https://pix.evopay.cash/v1 (+ /pix).
 * Autenticação: header "API-Key: <token>", token único por conta —
 * não existe ambiente de sandbox nem token separado de teste.
 */

export type EvoPayTransactionStatus =
  | "PENDING"
  | "COMPLETED"
  | "CANCELED"
  | "WAITING_FOR_REFUND"
  | "REFUNDED"
  | "EXPIRED";

export interface EvoPayTransaction {
  id: string;
  status: EvoPayTransactionStatus;
  amount: number;
  taxAmount?: number | null;
  amountWithTax?: number | null;
  qrCodeText?: string | null;
  qrCodeBase64?: string | null;
  qrCodeUrl?: string | null;
  payerName?: string | null;
  payerDocument?: string | null;
  endToEndId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePixChargeInput {
  amount: number;
  callbackUrl?: string;
  payerName?: string;
  payerDocument?: string;
  payerEmail?: string;
  externalReference?: string;
}

export class EvoPayError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EvoPayError";
    this.status = status;
  }
}

function getBaseUrl(): string {
  const url = process.env.EVOPAY_API_BASE_URL;
  if (!url) {
    throw new Error("EVOPAY_API_BASE_URL não configurada no ambiente.");
  }
  return url;
}

function getApiKey(): string {
  const key = process.env.EVOPAY_API_KEY;
  if (!key) {
    throw new Error("EVOPAY_API_KEY não configurada no ambiente.");
  }
  return key;
}

/**
 * Nunca loga headers/corpo da requisição (evita vazar o token em log).
 * Em caso de erro, extrai só a mensagem do corpo de resposta da EvoPay
 * (formato documentado: {success:false,message} ou {error}) — nunca
 * repassa isso diretamente ao usuário final, quem chama decide a
 * mensagem amigável.
 */
async function evoPayFetch<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      ...init,
      headers: {
        "API-Key": getApiKey(),
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    throw new EvoPayError(
      error instanceof Error ? `Falha de rede ao contatar a EvoPay: ${error.message}` : "Falha de rede ao contatar a EvoPay.",
      0
    );
  }

  if (!response.ok) {
    let message = `EvoPay respondeu ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string; error?: string };
      message = body.message || body.error || message;
    } catch {
      // corpo não é JSON — mantém a mensagem genérica com o status.
    }
    throw new EvoPayError(message, response.status);
  }

  return (await response.json()) as T;
}

/** POST /pix — cria uma cobrança Pix. */
export async function createPixCharge(input: CreatePixChargeInput): Promise<EvoPayTransaction> {
  return evoPayFetch<EvoPayTransaction>("/pix", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** GET /pix?id=... — consulta o status real de uma cobrança (fonte de verdade). */
export async function getPixCharge(transactionId: string): Promise<EvoPayTransaction> {
  const params = new URLSearchParams({ id: transactionId });
  return evoPayFetch<EvoPayTransaction>(`/pix?${params.toString()}`, {
    method: "GET",
  });
}
