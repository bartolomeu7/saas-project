"use client";

import { createSaleAction } from "@/lib/sales/actions";
import { SubmitButton } from "@/components/shared/auth/submit-button";

/**
 * createSaleAction só deve rodar quando o usuário clica aqui — nunca
 * durante o GET/render da página (ver /app/vendas/nova/page.tsx). Um
 * <form action={...}> só invoca a Server Action numa submissão real,
 * nunca por navegação, refresh, back/forward ou prefetch de <Link>.
 */
export function NewSaleButton() {
  return (
    <form action={createSaleAction}>
      <SubmitButton pendingLabel="Iniciando venda..." className="w-full sm:w-fit">
        Iniciar venda
      </SubmitButton>
    </form>
  );
}
