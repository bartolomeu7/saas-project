import { createHmac } from "node:crypto";
import { isIP } from "node:net";

/**
 * Identificação da conexão para o antifraude do teste grátis.
 *
 * NUNCA se confia em cabeçalho enviado pelo cliente. A origem confiável depende da infraestrutura:
 *  - Vercel: o edge da Vercel SOBRESCREVE `x-vercel-forwarded-for` / `x-forwarded-for` / `x-real-ip` com o IP real da
 *    conexão (um valor forjado pelo cliente não chega à aplicação). Só nesse caso (`onVercel`) os cabeçalhos valem.
 *  - Outro proxy próprio: configure TRUSTED_PROXY_HOPS = número de proxies confiáveis NA FRENTE da aplicação; o IP do
 *    cliente é o elemento `hops` posições a partir do FIM de x-forwarded-for (o que o cliente escreve fica à esquerda).
 *  - Sem nenhuma das duas: devolve null (identificador desconhecido) — NÃO usa x-forwarded-for cru.
 */

export interface IpEnv {
  /** process.env.VERCEL === "1" */
  onVercel: boolean;
  /** número de proxies confiáveis à frente (0 = nenhum) */
  trustedProxyHops: number;
}

export function readIpEnv(env: Record<string, string | undefined> = process.env): IpEnv {
  const hops = Number.parseInt(env.TRUSTED_PROXY_HOPS ?? "0", 10);
  return { onVercel: env.VERCEL === "1", trustedProxyHops: Number.isInteger(hops) && hops > 0 && hops <= 5 ? hops : 0 };
}

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().replace(/^\[|\]$/g, "");
  // remove porta de IPv4 ("1.2.3.4:5678") e zona de IPv6 ("fe80::1%eth0")
  const noPort = /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v) ? v.split(":")[0]! : v;
  const noZone = noPort.split("%")[0]!;
  return isIP(noZone) ? noZone : null;
}

/** IP do cliente a partir dos cabeçalhos, segundo a regra de confiança acima. null = não foi possível determinar. */
export function resolveClientIp(headers: { get(name: string): string | null }, env: IpEnv): string | null {
  if (env.onVercel) {
    const first = (headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for") ?? "").split(",")[0];
    return clean(first) ?? clean(headers.get("x-real-ip"));
  }
  if (env.trustedProxyHops > 0) {
    const parts = (headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
    const index = parts.length - env.trustedProxyHops;
    return index >= 0 ? clean(parts[index]) : null;
  }
  return null;
}

/** IPv4 inteiro; IPv6 agrupado no prefixo /64 (um usuário doméstico tem um /64 inteiro: bloquear o endereço exato não adianta). */
export function normalizeIp(ip: string): string {
  if (isIP(ip) === 4) return ip;
  // expande "::" e fica com os 4 primeiros grupos
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

/**
 * Identificador derivado por HMAC-SHA256 com segredo do servidor + separação de domínio. O IP em claro NUNCA é gravado.
 * Devolve 64 hex. O segredo é ANTIFRAUD_HASH_SECRET; se faltar, deriva-se do segredo do Clerk (também só de servidor),
 * o que evita fail-open por simples falta de variável — girar a chave apenas zera os contadores (inofensivo).
 */
export function hashClientIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(`trial-signup-ip:v1:${normalizeIp(ip)}`).digest("hex");
}

export function antifraudSecret(env: Record<string, string | undefined> = process.env): string | null {
  const dedicated = env.ANTIFRAUD_HASH_SECRET;
  if (dedicated && dedicated.length >= 16) return dedicated;
  const base = env.CLERK_SECRET_KEY;
  if (base && base.length >= 16) return createHmac("sha256", base).update("prime-ges:antifraud-secret:v1").digest("hex");
  return null;
}
