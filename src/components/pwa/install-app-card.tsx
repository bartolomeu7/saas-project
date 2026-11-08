"use client";

import { useState } from "react";
import { CheckCircle2, Download, Share, SquarePlus, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { promptInstall, useInstallState } from "@/lib/pwa/install";

/** Tela de Configurações → Aplicativo: instalar o Prime Ges na tela inicial do celular. */
export function InstallAppCard() {
  const state = useInstallState();
  const [busy, setBusy] = useState(false);

  async function install() {
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-5 rounded-xl border border-border bg-card/40 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-primary/15 p-2 text-primary"><Smartphone className="h-5 w-5" aria-hidden /></span>
        <div>
          <h2 className="font-semibold">Instalar o Prime Ges no celular</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Fica na tela inicial como um aplicativo, abre em tela cheia e leva direto para a agenda, vendas, clientes ou caixa.
            Você continua entrando com o seu login de sempre.
          </p>
        </div>
      </div>

      {state.installed ? (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm" role="status">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden /> Você já está usando o aplicativo instalado.
        </p>
      ) : state.canPrompt ? (
        <div>
          <Button type="button" onClick={install} disabled={busy}>
            <Download aria-hidden /> {busy ? "Abrindo..." : "Instalar aplicativo"}
          </Button>
        </div>
      ) : state.ios ? (
        <ol className="grid gap-2 text-sm">
          <li className="flex items-center gap-2"><Share className="h-4 w-4 text-primary" aria-hidden /> No Safari, toque em <strong>Compartilhar</strong>.</li>
          <li className="flex items-center gap-2"><SquarePlus className="h-4 w-4 text-primary" aria-hidden /> Escolha <strong>Adicionar à Tela de Início</strong>.</li>
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" aria-hidden /> Toque em <strong>Adicionar</strong>. O ícone do Prime Ges aparece na tela inicial.</li>
        </ol>
      ) : (
        <div className="grid gap-2 text-sm text-muted-foreground">
          <p><strong className="text-foreground">Android (Chrome):</strong> abra o menu do navegador (três pontinhos) e toque em <strong className="text-foreground">Instalar aplicativo</strong> ou <strong className="text-foreground">Adicionar à tela inicial</strong>.</p>
          <p><strong className="text-foreground">Computador (Chrome ou Edge):</strong> use o ícone de instalar na barra de endereço.</p>
          <p>Se a opção não aparecer, abra esta página no Chrome (Android) ou no Safari (iPhone).</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Sem internet, o aplicativo mostra só um aviso de &quot;sem conexão&quot;. Nenhum dado da sua empresa fica guardado no aparelho.
      </p>
    </section>
  );
}
