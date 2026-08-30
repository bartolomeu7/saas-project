import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CustomerDocument } from "@/types/customer-document";

/**
 * Documentos de um cliente, já com o nome de quem enviou resolvido. Duas
 * consultas simples (documentos → profiles) em vez de um join aninhado
 * via dot-notation do PostgREST — mesmo padrão de simplicidade já usado
 * em getCustomerTopProducts.
 */
export const listCustomerDocuments = cache(async function listCustomerDocuments(
  companyId: string,
  customerId: string
): Promise<CustomerDocument[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("customer_documents")
    .select("id, file_name, file_type, file_size, created_at, uploaded_by")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    return [];
  }

  const uploaderIds = Array.from(
    new Set(data.map((doc) => doc.uploaded_by).filter((id): id is string => id !== null))
  );

  const namesByUserId = new Map<string, string>();
  if (uploaderIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", uploaderIds);

    for (const profile of profiles ?? []) {
      namesByUserId.set(profile.user_id, profile.full_name || profile.email || "Usuário");
    }
  }

  return data.map((doc) => ({
    id: doc.id,
    fileName: doc.file_name,
    fileType: doc.file_type,
    fileSize: doc.file_size,
    createdAt: doc.created_at,
    uploadedByName: doc.uploaded_by ? namesByUserId.get(doc.uploaded_by) ?? "Usuário" : null,
  }));
});
