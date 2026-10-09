import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * "Intenção de aceite" do cadastro: prova, assinada pelo SERVIDOR, de que o visitante marcou
 * os dois checkboxes na tela de cadastro (e quais versões estavam vigentes naquele momento).
 *
 * Por que existe: o formulário do Clerk roda no navegador e o usuário só passa a existir
 * depois, então não dá para gravar o aceite no banco no instante do clique. O servidor emite
 * este token (cookie httpOnly, curta duração, HMAC com segredo que o navegador não tem) e,
 * quando o usuário recém-criado chega à aplicação, troca o token pelo registro definitivo em
 * user_consents. Um valor vindo do navegador (unsafeMetadata, campo oculto) NUNCA é prova.
 *
 * Este módulo é puro (só node:crypto) para os testes do Node o carregarem diretamente.
 */
export const SIGNUP_INTENT_COOKIE = "pg_legal_intent";
export const SIGNUP_INTENT_TTL_SECONDS = 60 * 60;

export interface SignupIntent {
  terms: string;
  privacy: string;
  /** Epoch em milissegundos em que o servidor emitiu o token. */
  issuedAt: number;
}

function signingKey(secret: string): Buffer {
  // chave derivada, separada de qualquer outro uso do mesmo segredo
  return createHmac("sha256", secret).update("prime-ges:legal-signup-intent:v1").digest();
}

function sign(secret: string, body: string): string {
  return createHmac("sha256", signingKey(secret)).update(body).digest("base64url");
}

export function createSignupIntent(
  secret: string,
  versions: { terms: string; privacy: string },
  now: number = Date.now()
): string {
  if (!secret) throw new Error("Segredo de assinatura ausente.");
  const payload = { t: versions.terms, p: versions.privacy, i: now, n: randomUUID() };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(secret, body)}`;
}

/** Devolve a intenção se a assinatura é válida e o token não expirou; senão null. */
export function verifySignupIntent(
  secret: string,
  token: string | null | undefined,
  now: number = Date.now()
): SignupIntent | null {
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts as [string, string];

  const expected = Buffer.from(sign(secret, body));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      t?: unknown;
      p?: unknown;
      i?: unknown;
    };
    if (typeof parsed.t !== "string" || typeof parsed.p !== "string" || typeof parsed.i !== "number") {
      return null;
    }
    const ageMs = now - parsed.i;
    if (ageMs < 0 || ageMs > SIGNUP_INTENT_TTL_SECONDS * 1000) return null;
    return { terms: parsed.t, privacy: parsed.p, issuedAt: parsed.i };
  } catch {
    return null;
  }
}

/**
 * O token só pode ser trocado por aceite quando o usuário é NOVO: criado depois da emissão do
 * token e dentro da janela de validade. Um usuário antigo que entre num navegador com token de
 * outra pessoa nunca se qualifica (e cai no aceite explícito).
 */
export function intentMatchesNewUser(
  intent: SignupIntent,
  userCreatedAt: number,
  now: number = Date.now()
): boolean {
  const windowMs = SIGNUP_INTENT_TTL_SECONDS * 1000;
  return userCreatedAt >= intent.issuedAt && userCreatedAt - intent.issuedAt <= windowMs && now - intent.issuedAt <= windowMs;
}
