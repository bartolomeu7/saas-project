import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import * as OTPAuth from "otpauth";

/**
 * Núcleo da verificação em duas etapas do Prime Ges (TOTP, RFC 6238). Módulo PURO (sem banco, sem Clerk, sem "server-only"):
 * é testável direto pelo Node e não conhece nenhum segredo de ambiente — a chave chega por parâmetro.
 *
 * Decisões de segurança:
 *  - o segredo TOTP é cifrado com AES-256-GCM antes de ir para o banco; o id do usuário entra como dado autenticado
 *    (AAD), então um segredo copiado para a linha de OUTRO usuário não decifra;
 *  - a chave mestra (32 bytes) gera duas subchaves independentes (cifra e HMAC dos códigos de backup) por HKDF;
 *  - códigos de backup são guardados só como HMAC-SHA256 (nunca em claro) e valem uma vez;
 *  - a comparação de códigos é em tempo constante.
 */

export const TOTP_ISSUER = "Prime Ges";
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Tolerância de relógio: aceita o passo anterior e o seguinte (±30 s). */
export const TOTP_WINDOW = 1;
export const BACKUP_CODE_COUNT = 10;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

// ---------------------------------------------------------------------------------------------------- chaves

export interface TwoFactorKeys {
  encKey: Buffer;
  hmacKey: Buffer;
}

/**
 * Lê a chave mestra (TWO_FACTOR_ENCRYPTION_KEY): 32 bytes em base64. Devolve null se ausente ou com tamanho errado
 * (o recurso fica indisponível; nunca cai num valor padrão).
 */
export function deriveKeys(masterBase64: string | undefined | null): TwoFactorKeys | null {
  if (!masterBase64) return null;
  let master: Buffer;
  try {
    master = Buffer.from(masterBase64.trim(), "base64");
  } catch {
    return null;
  }
  if (master.length !== 32) return null;
  const derive = (info: string) => Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), `prime-ges/2fa/${info}`, 32));
  return { encKey: derive("enc"), hmacKey: derive("hmac") };
}

// ---------------------------------------------------------------------------------------------------- cifra do segredo

const VERSION = "v1";

/** Formato: v1.<iv>.<tag>.<texto cifrado>, tudo em base64url. */
export function encryptSecret(plain: string, keys: TwoFactorKeys, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys.encKey, iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}

/** Devolve o segredo, ou null se o formato, a chave ou o dono não conferem (nunca lança com dado do banco). */
export function decryptSecret(stored: string, keys: TwoFactorKeys, userId: string): string | null {
  try {
    const [version, iv, tag, body] = stored.split(".");
    if (version !== VERSION || !iv || !tag || !body) return null;
    const decipher = createDecipheriv("aes-256-gcm", keys.encKey, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(userId, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------- TOTP

/** Segredo novo de 160 bits (padrão do Google Authenticator), em base32. */
export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totpFor(secretBase32: string, label = "conta"): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label,
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/** URI otpauth:// para o QR code e para o botão "abrir no app autenticador". */
export function buildOtpauthUri(secretBase32: string, accountLabel: string): string {
  return totpFor(secretBase32, accountLabel).toString();
}

/** Número do passo de 30 s em que `timestampMs` cai. */
export function totpStep(timestampMs: number): number {
  return Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** Código esperado para um instante (usado só em testes e na conferência). */
export function generateTotp(secretBase32: string, timestampMs: number): string {
  return totpFor(secretBase32).generate({ timestamp: timestampMs });
}

/**
 * Confere um código de 6 dígitos. Devolve o NÚMERO DO PASSO em que ele vale (para o banco recusar o reuso do mesmo
 * código) ou null se estiver errado. Aceita ±1 passo de tolerância de relógio.
 */
export function verifyTotp(secretBase32: string, token: string, timestampMs: number): number | null {
  if (!/^\d{6}$/.test(token)) return null;
  const delta = totpFor(secretBase32).validate({ token, timestamp: timestampMs, window: TOTP_WINDOW });
  return delta === null ? null : totpStep(timestampMs) + delta;
}

// ---------------------------------------------------------------------------------------------------- entrada do usuário

export type CodeKind = "totp" | "backup" | "invalid";

/** Tira espaços e hífens e põe em maiúsculas: "123 456" e "abcde-12345" são aceitos como o usuário digita. */
export function normalizeCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

export function classifyCode(input: string): { kind: CodeKind; code: string } {
  const code = normalizeCode(input);
  if (/^\d{6}$/.test(code)) return { kind: "totp", code };
  if (new RegExp(`^[${BACKUP_ALPHABET}]{10}$`).test(code)) return { kind: "backup", code };
  return { kind: "invalid", code };
}

// ---------------------------------------------------------------------------------------------------- códigos de backup

/** Sem 0/O, 1/I/L para não confundir quando a pessoa copia à mão. */
const BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Códigos no formato XXXXX-XXXXX (10 caracteres, ~48 bits cada). */
export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 10 }, () => BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

/** HMAC-SHA256 (hex) do código normalizado: é o que vai para o banco. */
export function hashBackupCode(code: string, keys: TwoFactorKeys): string {
  return createHmac("sha256", keys.hmacKey).update(normalizeCode(code)).digest("hex");
}

/** Comparação em tempo constante de dois textos. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
