"use client";

import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { Header } from "@/components/app/header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Company } from "@/types/company";

/**
 * Casca da área autenticada: SidebarProvider (shadcn/ui) + header + conteúdo.
 * O estado recolhido/expandido da sidebar é persistido em cookie pelo próprio
 * SidebarProvider e lido no layout do servidor (`defaultOpen`).
 */
export function AppShell({
  company,
  userName,
  userEmail,
  defaultOpen = true,
  children,
}: {
  company: Company;
  userName?: string | null;
  userEmail?: string | null;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar userName={userName} userEmail={userEmail} />
        <SidebarInset className="min-w-0 bg-background">
          <a
            href="#conteudo-principal"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
          >
            Pular para o conteúdo
          </a>
          <Header company={company} />
          <main id="conteudo-principal" className="flex-1" tabIndex={-1}>
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
