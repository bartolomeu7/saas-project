/**
 * Modo manutenção: com MAINTENANCE_MODE=1 o site inteiro responde 503 com uma página simples.
 * Serve para janelas curtas em que o banco muda de lugar (nenhuma gravação nova pode entrar).
 * Fica de fora só a verificação de saúde, para o monitoramento continuar funcionando.
 * Não depende de banco, de Clerk nem de nenhum serviço externo.
 */

const MAINTENANCE_EXEMPT_PATHS = ["/api/health"];

export function isMaintenanceOn(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

export function isMaintenanceExempt(pathname: string): boolean {
  return MAINTENANCE_EXEMPT_PATHS.some((p) => pathname === p);
}

export function maintenanceResponse(): Response {
  const html =
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Em manutenção | Prime Ges</title></head>' +
    '<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;text-align:center">' +
    "<h1>Estamos em manutenção</h1><p>Estamos fazendo uma atualização rápida no Prime Ges. Seus dados estão seguros. Volte em alguns minutos.</p></body></html>";
  return new Response(html, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "600",
    },
  });
}
