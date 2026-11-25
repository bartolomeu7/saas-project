import type { ReactNode } from "react";
import { Schibsted_Grotesk } from "next/font/google";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ScrollProgress } from "@/components/marketing/motion";
import { cn } from "@/lib/utils";

const display = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-display" });

/** Moldura das páginas de apresentação: cabeçalho, conteúdo, rodapé e o tema próprio do site (.site). */
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className={cn("site", display.variable)}>
      <ScrollProgress />
      <SiteHeader />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
