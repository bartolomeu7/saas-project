"use client";

import type { ReactNode } from "react";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { UserRole } from "@/types/profile";

/**
 * Casca do painel da PLATAFORMA: SidebarProvider (shadcn/ui) + header +
 * conteúdo. Não usa o AppShell da empresa porque aquele exige uma `company`;
 * o admin é global e funciona sem pertencer a nenhuma empresa.
 */
export function AdminShell({
  userName,
  userEmail,
  role,
  roleLabel,
  defaultOpen = true,
  children,
}: {
  userName?: string | null;
  userEmail?: string | null;
  role: UserRole;
  roleLabel: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <PresenceHeartbeat />
      <SidebarProvider defaultOpen={defaultOpen}>
        <AdminSidebar userName={userName} userEmail={userEmail} role={role} />
        <SidebarInset className="min-w-0 bg-background">
          <a
            href="#conteudo-principal"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
          >
            Pular para o conteúdo
          </a>
          <AdminHeader roleLabel={roleLabel} />
          {/* SidebarInset já renderiza o <main> da página: o alvo do "pular para o conteúdo" é uma div (landmark main único). */}
          <div id="conteudo-principal" className="flex-1" tabIndex={-1}>
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
