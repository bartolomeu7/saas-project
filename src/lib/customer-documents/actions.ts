"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/log";
import { AUDIT_ACTIONS } from "@/types/audit";
import { detectRealMimeType, MIME_EXTENSIONS } from "@/lib/customer-documents/mime-detection";
import type { ActionResult } from "@/lib/auth/actions";

// O conteúdo vai para o banco (o servidor não tem serviço de arquivos). Acompanha next.config.js (bodySizeLimit).
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Envia um documento para o cliente informado. `customerId` é passado por
 * bind (não vem do formulário); mesmo assim é revalidado contra a empresa
 * atual antes de qualquer upload, nunca confiando no valor por si só.
 */
export async function uploadCustomerDocumentAction(
  customerId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione um arquivo." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: "O arquivo excede o limite de 5 MB." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = await createSessionClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("company_id", current.company.id)
    .maybeSingle();

  if (!customer) {
    return { error: "Cliente não encontrado." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const realType = detectRealMimeType(buffer);

  if (!realType) {
    return { error: "Tipo de arquivo não permitido. Envie PDF, JPEG, PNG ou WEBP." };
  }

  const extension = MIME_EXTENSIONS[realType];
  // file_path continua único por documento (a coluna é obrigatória); o arquivo em si fica em customer_document_files.
  const path = `${current.company.id}/${customerId}/${randomUUID()}.${extension}`;

  const user = await getCurrentUser();
  const fileName = file.name.slice(0, 255);

  const { data: inserted, error: insertError } = await supabase
    .from("customer_documents")
    .insert({
      company_id: current.company.id,
      customer_id: customerId,
      file_path: path,
      file_name: fileName,
      file_type: realType,
      file_size: file.size,
      uploaded_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { error: "Não foi possível salvar o documento. Tente novamente." };
  }

  const { error: contentError } = await supabase
    .from("customer_document_files")
    .insert({ document_id: inserted.id, company_id: current.company.id, data_base64: buffer.toString("base64") });

  if (contentError) {
    // Sem o conteúdo, o registro não serve para nada: desfaz.
    await supabase.from("customer_documents").delete().eq("id", inserted.id).eq("company_id", current.company.id);
    return { error: "Não foi possível enviar o arquivo. Tente novamente." };
  }

  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "customer_document",
    entityId: inserted.id,
    action: AUDIT_ACTIONS.CUSTOMER_DOCUMENT_UPLOADED,
    metadata: { customerId, fileName, fileType: realType, fileSize: file.size },
  });

  revalidatePath(`/app/clientes/${customerId}`);
  return { success: "Documento enviado." };
}

/** Remove um documento; o conteúdo sai junto (cascata no banco). */
export async function deleteCustomerDocumentAction(
  documentId: string,
  customerId: string,
  _prevState: ActionResult
): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = await createSessionClient();

  const { data: document } = await supabase
    .from("customer_documents")
    .select("id, file_path, file_name, file_type, file_size")
    .eq("id", documentId)
    .eq("company_id", current.company.id)
    .maybeSingle();

  if (!document) {
    return { error: "Documento não encontrado." };
  }

  const { error: deleteError } = await supabase
    .from("customer_documents")
    .delete()
    .eq("id", documentId)
    .eq("company_id", current.company.id);

  if (deleteError) {
    return { error: "Não foi possível remover o documento. Tente novamente." };
  }

  const user = await getCurrentUser();
  await writeAuditLog(supabase, {
    companyId: current.company.id,
    actorUserId: user?.id ?? null,
    entityType: "customer_document",
    entityId: documentId,
    action: AUDIT_ACTIONS.CUSTOMER_DOCUMENT_DELETED,
    metadata: {
      customerId,
      fileName: document.file_name,
      fileType: document.file_type,
      fileSize: document.file_size,
    },
  });

  revalidatePath(`/app/clientes/${customerId}`);
  return { success: "Documento removido." };
}
