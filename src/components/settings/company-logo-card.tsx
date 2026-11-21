"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import { ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { removeCompanyLogoAction, uploadCompanyLogoAction } from "@/lib/companies/actions";
import type { ActionResult } from "@/lib/auth/actions";
import { MAX_LOGO_BYTES } from "@/lib/validations/company-logo";
import { FormMessage } from "@/components/shared/auth/form-message";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { Button } from "@/components/ui/button";
import { useKeepInputOnError } from "@/hooks/use-keep-input-on-error";

const initialState: ActionResult = {};
const ACCEPT = "image/png,image/jpeg,image/webp";

/**
 * Logo da empresa (aparece no PDF do orçamento). PNG, JPG ou WEBP de até 512 KB; SVG não é aceito.
 * A conferência de verdade é do servidor (pelo conteúdo do arquivo) e do banco; aqui só se avisa na hora.
 */
export function CompanyLogoCard({ hasLogo, version }: { hasLogo: boolean; version: string | null }) {
  const router = useRouter();
  const [state, formAction] = useFormState(uploadCompanyLogoAction, initialState);
  const keepInput = useKeepInputOnError(state);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function onPick(file: File | undefined) {
    setLocalError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) {
      setLocalError("Use uma imagem PNG, JPG ou WEBP.");
      if (input.current) input.current.value = "";
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLocalError("A imagem é grande demais. Use uma de até 512 KB.");
      if (input.current) input.current.value = "";
      return;
    }
    setPreview(URL.createObjectURL(file));
  }

  function remove() {
    startRemoving(async () => {
      const result = await removeCompanyLogoAction();
      if (result.error) toast.error(result.error);
      else toast.success(result.success ?? "Logo removido.");
      router.refresh();
    });
  }

  const shown = preview ?? (hasLogo ? `/api/empresa/logo?v=${encodeURIComponent(version ?? "0")}` : null);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-2">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Logo da empresa" className="max-h-full max-w-full object-contain" />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <form
        action={formAction}
        onReset={keepInput}
        onSubmit={(event) => {
          if (!input.current?.files?.length) {
            event.preventDefault();
            setLocalError("Escolha uma imagem para o logo.");
          }
        }}
        className="flex min-w-0 flex-1 flex-col gap-3"
      >
        <div className="grid gap-1.5">
          <label htmlFor="company-logo-file" className="text-sm font-medium">
            {hasLogo ? "Trocar logo" : "Enviar logo"}
          </label>
          <input
            ref={input}
            id="company-logo-file"
            name="logo"
            type="file"
            accept={ACCEPT}
            onChange={(event) => onPick(event.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
          />
          <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP, até 512 KB, de preferência com fundo transparente ou branco. SVG não é aceito.</p>
        </div>
        {localError && (
          <p role="alert" className="text-sm text-destructive">
            {localError}
          </p>
        )}
        <FormMessage state={state} />
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton state={state} pendingLabel="Enviando..." className="w-auto">
            {hasLogo ? "Salvar novo logo" : "Salvar logo"}
          </SubmitButton>
          {hasLogo && (
            <Button type="button" variant="ghost" size="sm" disabled={removing} onClick={remove}>
              <Trash2 aria-hidden="true" />
              Remover logo
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
