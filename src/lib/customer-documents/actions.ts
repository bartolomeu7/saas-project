"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/log";
import { AUDIT_ACTIONS } from "@/types/audit";
import { detectRealMimeType, MIME_EXTENSIONS } from "@/lib/customer-documents/mime-detection";
import type { ActionResult } from "@/lib/auth/actions";

const BUCKET = "customer-documents";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB — mesmo limite do bucket e da constraint da tabela.

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
    return { error: "O arquivo excede o limite de 10 MB." };
  }

  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();

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
  const path = `${current.company.id}/${customerId}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: realType, upsert: false });

  if (uploadError) {
    return { error: "Não foi possível enviar o arquivo. Tente novamente." };
  }

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
    // Registro não foi criado — remove o objeto órfão do Storage.
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: "Não foi possível salvar o documento. Tente novamente." };
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

/**
 * Remove um documento: primeiro o objeto no Storage, só depois o
 * registro na tabela. Se a remoção do Storage falhar, o registro NÃO é
 * removido — nunca fica um registro apontando para um arquivo já
 * removido silenciosamente.
 */
export async function deleteCustomerDocumentAction(
  documentId: string,
  customerId: string,
  _prevState: ActionResult
): Promise<ActionResult> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();

  const { data: document } = await supabase
    .from("customer_documents")
    .select("id, file_path, file_name, file_type, file_size")
    .eq("id", documentId)
    .eq("company_id", current.company.id)
    .maybeSingle();

  if (!document) {
    return { error: "Documento não encontrado." };
  }

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([document.file_path]);

  if (storageError) {
    return { error: "Não foi possível remover o arquivo. Tente novamente." };
  }

  const { error: deleteError } = await supabase
    .from("customer_documents")
    .delete()
    .eq("id", documentId)
    .eq("company_id", current.company.id);

  if (deleteError) {
    return {
      error:
        "O arquivo foi removido, mas houve um problema ao remover o registro. Contate o suporte.",
    };
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

/**
 * Gera uma URL assinada de curta duração para visualizar/baixar um
 * documento — nunca uma URL pública. Chamada diretamente por um Client
 * Component (Server Action invocada fora de um <form>), sem expor o
 * client de service_role.
 */
export async function getCustomerDocumentUrlAction(
  documentId: string
): Promise<{ url?: string; error?: string }> {
  const current = await getCurrentCompany();
  if (!current) {
    return { error: "Nenhuma empresa encontrada para o usuário atual." };
  }

  const supabase = createClient();

  const { data: document } = await supabase
    .from("customer_documents")
    .select("file_path")
    .eq("id", documentId)
    .eq("company_id", current.company.id)
    .maybeSingle();

  if (!document) {
    return { error: "Documento não encontrado." };
  }

  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(document.file_path, 60);

  if (error || !signed) {
    return { error: "Não foi possível gerar o link de acesso. Tente novamente." };
  }

  return { url: signed.signedUrl };
}
