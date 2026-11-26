"use server";

import { parseSearch } from "@/lib/admin/params";
import { requirePlatformAdmin, searchPlatform } from "@/lib/admin/queries";
import type { SearchHit } from "@/types/admin";

/** Busca da paleta de comandos do painel (Ctrl+K). Mesma RPC da página Ferramentas, que exige administrador no banco. */
export async function adminSearchAction(term: string): Promise<SearchHit[]> {
  await requirePlatformAdmin();
  const query = parseSearch(typeof term === "string" ? term : undefined);
  if (!query || query.length < 2) return [];
  return (await searchPlatform(query)).slice(0, 15);
}
