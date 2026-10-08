"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ADMIN_ROUTE_LABELS } from "@/components/admin/admin-nav-items";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Header do painel da plataforma. Estrutura do `site-header` do bloco
 * dashboard-01 do shadcn/ui (SidebarTrigger + Separator + título), com
 * breadcrumb derivado da rota e o selo do papel administrativo.
 */
export function AdminHeader({ roleLabel }: { roleLabel: string }) {
  const pathname = usePathname() ?? "/admin";
  const pageLabel = ADMIN_ROUTE_LABELS[pathname] ?? ADMIN_ROUTE_LABELS[`/${pathname.split("/").slice(1, 3).join("/")}`];
  const isHome = pathname === "/admin";

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger
            className="-ml-1 text-muted-foreground hover:text-foreground"
            aria-label="Abrir ou recolher o menu"
          />
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList>
              <BreadcrumbItem>
                {isHome ? (
                  <BreadcrumbPage>Admin</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href="/admin">Admin</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isHome && pageLabel && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="info" className="hidden sm:inline-flex">
            {roleLabel}
          </Badge>
          <Link
            href="/app"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
          >
            <ArrowLeft className="size-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">Voltar ao Prime Ges</span>
            <span className="sm:hidden">App</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
