"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyPixButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard indisponível (ex: contexto não seguro) — sem efeito
      // colateral perigoso, o usuário ainda pode selecionar o texto.
    }
  }

  return (
    <Button onClick={handleCopy} variant="outline" className="w-full">
      {copied ? "Código copiado!" : "Copiar código Pix"}
    </Button>
  );
}
