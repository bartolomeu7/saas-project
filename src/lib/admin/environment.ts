import "server-only";

export interface EnvironmentCheck {
  key: string;
  label: string;
  configured: boolean;
  /** Informação NÃO secreta (ex.: modo test/live). Nunca o valor da variável. */
  detail?: string;
}

function mode(value: string | undefined, prefixes: { test: string; live: string }): string | undefined {
  if (!value) return undefined;
  if (value.startsWith(prefixes.live)) return "produção (live)";
  if (value.startsWith(prefixes.test)) return "desenvolvimento (test)";
  return undefined;
}

/**
 * Diagnóstico de configuração do ambiente atual: só diz se cada variável está
 * definida (e, quando seguro, o modo test/live a partir do PREFIXO). Os valores
 * nunca são lidos para a resposta nem registrados.
 */
export function getEnvironmentChecks(): EnvironmentCheck[] {
  const env = process.env;

  return [
    {
      key: "clerk_publishable",
      label: "Clerk — chave pública",
      configured: Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
      detail: mode(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, { test: "pk_test_", live: "pk_live_" }),
    },
    {
      key: "clerk_secret",
      label: "Clerk — chave secreta",
      configured: Boolean(env.CLERK_SECRET_KEY),
      detail: mode(env.CLERK_SECRET_KEY, { test: "sk_test_", live: "sk_live_" }),
    },
    { key: "supabase_url", label: "Supabase — URL", configured: Boolean(env.NEXT_PUBLIC_SUPABASE_URL) },
    { key: "supabase_anon", label: "Supabase — chave anon", configured: Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) },
    { key: "supabase_service", label: "Supabase — service role (somente servidor)", configured: Boolean(env.SUPABASE_SERVICE_ROLE_KEY) },
    { key: "syncpay_id", label: "SyncPay — Client ID", configured: Boolean(env.SYNCPAY_CLIENT_ID) },
    { key: "syncpay_secret", label: "SyncPay — Client Secret (somente servidor)", configured: Boolean(env.SYNCPAY_CLIENT_SECRET) },
    { key: "syncpay_webhook", label: "SyncPay — segredo do webhook", configured: Boolean(env.SYNCPAY_WEBHOOK_SECRET) },
    { key: "syncpay_card", label: "SyncPay — cartão (chave pública + liberação)", configured: Boolean(env.SYNCPAY_PUBLIC_KEY) && env.SYNCPAY_CARD_ENABLED === "1" },
    { key: "app_url", label: "URL pública do app", configured: Boolean(env.NEXT_PUBLIC_APP_URL) },
  ];
}
