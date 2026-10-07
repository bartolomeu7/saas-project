"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { FileText, Download, Trash2 } from "lucide-react";
import {
  uploadCustomerDocumentAction,
  deleteCustomerDocumentAction,
  getCustomerDocumentUrlAction,
} from "@/lib/customer-documents/actions";
import type { ActionResult } from "@/lib/auth/actions";
import type { CustomerDocument } from "@/types/customer-document";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";
import { EmptyState } from "@/components/app/empty-state";
import { formatDate, formatFileSize } from "@/lib/format";
import { ConfirmDialog } from "@/components/app/confirm-dialog";

const FILE_TYPE_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WEBP",
};

const initialState: ActionResult = {};

function UploadDocumentForm({ customerId }: { customerId: string }) {
  const [state, formAction] = useFormState(
    uploadCustomerDocumentAction.bind(null, customerId),
    initialState
  );
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Reseta o campo de arquivo só depois que o upload termina com sucesso
  // — o `action` do form precisa continuar sendo `formAction` diretamente
  // (não um wrapper) para o useFormStatus() do SubmitButton reconhecer o
  // estado pendente corretamente.
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setSelectedName(null);
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-col gap-1">
        <Input
          type="file"
          name="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          required
          onChange={(event) => setSelectedName(event.target.files?.[0]?.name ?? null)}
        />
        <p className="text-xs text-muted-foreground">
          PDF, JPEG, PNG ou WEBP — até 10 MB.
          {selectedName && ` Selecionado: ${selectedName}`}
        </p>
      </div>
      <SubmitButton state={state} pendingLabel="Enviando..." className="w-full sm:w-fit">
        Enviar documento
      </SubmitButton>
      <div className="sm:basis-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

function DownloadDocumentButton({ documentId }: { documentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={loading}
        onClick={async () => {
          setError(null);
          setLoading(true);
          const result = await getCustomerDocumentUrlAction(documentId);
          setLoading(false);
          if (result.error || !result.url) {
            setError(result.error ?? "Não foi possível gerar o link.");
            return;
          }
          window.open(result.url, "_blank", "noopener,noreferrer");
        }}
      >
        <Download className="h-3.5 w-3.5" />
        {loading ? "Gerando..." : "Visualizar"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function DeleteDocumentButton({
  documentId,
  customerId,
}: {
  documentId: string;
  customerId: string;
}) {
  const [state, formAction] = useFormState(
    deleteCustomerDocumentAction.bind(null, documentId, customerId),
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col items-end gap-1">
      <ConfirmDialog
        title="Excluir este documento?"
        description="Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        destructive
        onConfirm={() => formRef.current?.requestSubmit()}
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-auto gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir
          </Button>
        }
      />
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

export function CustomerDocumentsTab({
  customerId,
  documents,
}: {
  customerId: string;
  documents: CustomerDocument[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <UploadDocumentForm customerId={customerId} />

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum documento enviado ainda."
          description="Os documentos enviados para este cliente aparecerão aqui."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((document) => (
            <div
              key={document.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{document.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {FILE_TYPE_LABELS[document.fileType] ?? document.fileType} ·{" "}
                    {formatFileSize(document.fileSize)} · {formatDate(document.createdAt)}
                    {document.uploadedByName && ` · Enviado por ${document.uploadedByName}`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-start gap-2 self-end sm:self-center">
                <DownloadDocumentButton documentId={document.id} />
                <DeleteDocumentButton documentId={document.id} customerId={customerId} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
