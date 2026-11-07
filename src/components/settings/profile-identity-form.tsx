"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { describeClerkError } from "@/lib/settings/clerk-errors";
import { syncProfileFromClerkAction } from "@/lib/settings/actions";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // limite do Clerk para a foto de perfil
const ACCEPTED_IMAGES = "image/png,image/jpeg,image/webp,image/gif";

function initials(first: string, last: string, email?: string): string {
  const letters = `${first.trim()[0] ?? ""}${last.trim()[0] ?? ""}`.toUpperCase();
  return letters || (email?.[0]?.toUpperCase() ?? "?");
}

/** Nome e foto de perfil. Fala direto com a conta (Clerk) e, em seguida, atualiza o perfil usado no menu e na equipe. */
export function ProfileIdentityForm() {
  const { isLoaded, user } = useUser();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [photoPending, setPhotoPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);

  if (!isLoaded || !user) {
    return <div className="h-40 animate-pulse rounded-lg bg-muted/40" aria-busy="true" aria-label="Carregando perfil" />;
  }

  const first = firstName ?? user.firstName ?? "";
  const last = lastName ?? user.lastName ?? "";
  const dirty = first.trim() !== (user.firstName ?? "") || last.trim() !== (user.lastName ?? "");

  async function refreshEverywhere() {
    const result = await syncProfileFromClerkAction();
    if (result.error) toast.warning(result.error);
    router.refresh();
  }

  function saveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setError(null);
    if (!first.trim()) {
      setError("Informe pelo menos o primeiro nome.");
      return;
    }
    startTransition(async () => {
      try {
        await user.update({ firstName: first.trim(), lastName: last.trim() });
        setFirstName(null);
        setLastName(null);
        toast.success("Nome atualizado.");
        await refreshEverywhere();
      } catch (err) {
        setError(describeClerkError(err));
      }
    });
  }

  async function changePhoto(file: File | null) {
    if (!user) return;
    setError(null);
    if (file) {
      if (!file.type.startsWith("image/")) {
        setError("Escolha um arquivo de imagem (PNG, JPG, WEBP ou GIF).");
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError("A imagem é grande demais. Use uma de até 10 MB.");
        return;
      }
    }
    setPhotoPending(true);
    try {
      await user.setProfileImage({ file });
      toast.success(file ? "Foto atualizada." : "Foto removida.");
      await refreshEverywhere();
    } catch (err) {
      setError(describeClerkError(err));
    } finally {
      setPhotoPending(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="h-20 w-20 text-xl">
          {user.hasImage && <AvatarImage src={user.imageUrl} alt="Sua foto de perfil" />}
          <AvatarFallback>{initials(first, last, user.primaryEmailAddress?.emailAddress)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={photoPending} onClick={() => fileInput.current?.click()}>
              {photoPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}
              {user.hasImage ? "Trocar foto" : "Enviar foto"}
            </Button>
            {user.hasImage && (
              <Button type="button" variant="ghost" size="sm" disabled={photoPending} onClick={() => void changePhoto(null)}>
                <Trash2 aria-hidden="true" />
                Remover
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPG, WEBP ou GIF, até 10 MB.</p>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_IMAGES}
            className="sr-only"
            tabIndex={-1}
            aria-label="Escolher foto de perfil"
            onChange={(event) => void changePhoto(event.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <form onSubmit={saveName} className="grid gap-4 sm:grid-cols-2" noValidate>
        <FormField label="Nome">
          <Input value={first} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" maxLength={80} required />
        </FormField>
        <FormField label="Sobrenome">
          <Input value={last} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" maxLength={80} />
        </FormField>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={!dirty || pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Salvar nome
          </Button>
        </div>
      </form>

      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
