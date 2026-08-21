import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/profile";

/**
 * Retorna o usuário autenticado (via auth.users) da request atual,
 * ou null se não houver sessão. Uso exclusivo server-side.
 */
export async function getCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

/**
 * Retorna o perfil (public.profiles) do usuário autenticado atual,
 * ou null se não houver sessão ou perfil. Protegido por RLS — só é
 * possível ler o próprio perfil.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Profile;
}
