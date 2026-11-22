#!/usr/bin/env node
/**
 * Cadastra na SyncPay o webhook `transaction` (Pix e cartão) do Prime Ges e grava o SEGREDO de assinatura direto no arquivo
 * de ambiente do servidor — o segredo nunca é impresso no terminal nem vai para o repositório.
 *
 * A SyncPay mostra o `token` (segredo) UMA ÚNICA vez, na criação do webhook (POST /webhooks). Se perder:
 * POST /webhooks/{id}/rotate-secret (ou apague e crie de novo).
 *
 * Uso (PowerShell):
 *   node scripts/syncpay-register-webhook.mjs --env E:\primeges-local\site.env --url https://primeges.com.br/api/webhooks/syncpay
 *
 * Precisa de SYNCPAY_CLIENT_ID e SYNCPAY_CLIENT_SECRET já preenchidos no arquivo, e do IP do servidor autorizado no painel
 * (Developer → API → IPs Autorizados). Recusa-se a rodar se SYNCPAY_WEBHOOK_SECRET já estiver preenchido (não duplica webhook);
 * use --force para criar outro mesmo assim (o antigo continua existindo na SyncPay: apague-o no painel).
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const envPath = arg("--env");
const url = arg("--url");
const force = args.includes("--force");
if (!envPath || !url) {
  console.error("Uso: node scripts/syncpay-register-webhook.mjs --env <arquivo .env> --url https://SEU-DOMINIO/api/webhooks/syncpay [--force]");
  process.exit(2);
}
if (!/^https:\/\/[^\s/]+\/api\/webhooks\/syncpay$/.test(url)) {
  console.error("A URL precisa ser HTTPS e terminar em /api/webhooks/syncpay.");
  process.exit(2);
}

const text = readFileSync(envPath, "utf8");
const read = (key) => {
  const m = new RegExp(`^${key}=(.*)$`, "m").exec(text);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
};
const clientId = read("SYNCPAY_CLIENT_ID");
const clientSecret = read("SYNCPAY_CLIENT_SECRET");
const base = (read("SYNCPAY_API_BASE_URL") || "https://api.syncpayments.com.br").replace(/\/+$/, "");
if (!clientId || !clientSecret) {
  console.error("Preencha SYNCPAY_CLIENT_ID e SYNCPAY_CLIENT_SECRET no arquivo de ambiente primeiro.");
  process.exit(2);
}
if (read("SYNCPAY_WEBHOOK_SECRET") && !force) {
  console.error("SYNCPAY_WEBHOOK_SECRET já está preenchido: o webhook parece estar cadastrado. Use --force para criar outro.");
  process.exit(2);
}

async function call(path, init) {
  const response = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body.message === "string" ? body.message : typeof body.error_description === "string" ? body.error_description : `HTTP ${response.status}`;
    throw new Error(`${path}: ${message} (HTTP ${response.status})`);
  }
  return body;
}

const auth = await call("/api/partner/v1/auth-token", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
});

const created = await call("/api/partner/v1/webhooks", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${auth.access_token}` },
  body: JSON.stringify({ title: "Prime Ges - assinaturas", url, event: "transaction", trigger_all_products: true }),
});

if (typeof created.token !== "string" || created.token === "") {
  console.error("A SyncPay criou o webhook mas não devolveu o segredo. Rotacione o segredo (POST /webhooks/{id}/rotate-secret) e grave-o manualmente.");
  process.exit(1);
}

copyFileSync(envPath, `${envPath}.bak-syncpay-${Date.now()}`);
const line = `SYNCPAY_WEBHOOK_SECRET=${created.token}`;
const next = /^SYNCPAY_WEBHOOK_SECRET=.*$/m.test(text) ? text.replace(/^SYNCPAY_WEBHOOK_SECRET=.*$/m, line) : `${text.replace(/\s*$/, "\n")}${line}\n`;
writeFileSync(envPath, next);

console.log(`Webhook cadastrado (id ${created.id ?? "?"}) para o evento "transaction" em ${url}.`);
console.log("Segredo gravado em SYNCPAY_WEBHOOK_SECRET no arquivo de ambiente (não foi exibido). Reinicie o site para carregar.");
