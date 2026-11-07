"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/auth/actions";

/**
 * Copia nome, e-mail principal e foto da conta (Clerk) para o perfil interno (public.profiles), que é o que o menu
 * lateral, a equipe e o painel mostram. O perfil só era preenchido no primeiro acesso; sem isto, trocar o nome ou o
 * e-mail na tela de Configurações deixaria o resto do sistema com o dado antigo.
 *
 * NADA vem do navegador: os valores são lidos do Clerk aqui no servidor (currentUser()) e só o e-mail principal JÁ
 * VERIFICADO é copiado. A escrita passa pela RLS da própria linha (profiles_update_own) e pela trigger que bloqueia
 * troca de role/status — esta função não toca em nenhum dos dois.
 */
export async function syncProfileFromClerkAction(): Promise<ActionResult> {
  const [clerkUser, user] = await Promise.all([currentUser(), getCurrentUser().catch(() => null)]);
  if (!clerkUser || !user) return { error: "Sessão expirada. Faça login novamente." };

  const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim().slice(0, 160) || null;
  const primary = clerkUser.primaryEmailAddress;
  const email = primary && primary.verification?.status === "verified" ? primary.emailAddress : null;

  const update: { full_name: string | null; avatar_url: string | null; email?: string } = {
    full_name: fullName,
    avatar_url: clerkUser.hasImage ? clerkUser.imageUrl : null,
  };
  // E-mail ausente/não verificado: mantém o que já está no perfil (nunca grava vazio nem texto não verificado).
  if (email) update.email = email;

  const supabase = await createSessionClient();
  const { error } = await supabase.from("profiles").update(update).eq("user_id", user.id);
  if (error) {
    console.error("[settings] sincronizar perfil falhou:", error.message);
    return { error: "Dados salvos na conta, mas não foi possível atualizar o menu agora. Recarregue a página." };
  }

  revalidatePath("/app", "layout");
  revalidatePath("/admin", "layout");
  return { success: "Perfil atualizado." };
}
