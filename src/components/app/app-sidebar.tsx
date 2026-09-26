"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "@/components/app/nav-items";
import { UserMenu } from "@/components/app/user-menu";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { siteConfig } from "@/config/site";

/**
 * Navegação principal da área autenticada, construída sobre o componente
 * Sidebar do shadcn/ui: recolhe para ícones no desktop, vira drawer
 * (Sheet) no mobile e mantém o estado ativo por rota. Os grupos e a
 * habilitação de cada item continuam vindo de `nav-items.ts`.
 */
export function AppSidebar({
  userName,
  userEmail,
}: {
  userName?: string | null;
  userEmail?: string | null;
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-3">
        <Link
          href="/app"
          onClick={() => isMobile && setOpenMobile(false)}
          className="flex items-center gap-2 rounded-md px-1 font-semibold tracking-tight outline-none ring-sidebar-ring focus-visible:ring-2"
          aria-label={`${siteConfig.name} — ir para o Dashboard`}
        >
          <Image
            src="/logo.png"
            alt=""
            width={24}
            height={24}
            priority
            style={{ width: 24, height: 24 }}
            className="shrink-0"
          />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            {siteConfig.name}
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0 py-2">
        {NAV_GROUPS.map((group, index) => (
          <SidebarGroup key={group.label ?? `group-${index}`} className="py-1.5">
            {group.label && (
              <SidebarGroupLabel className="h-7 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/app" && !!pathname?.startsWith(`${item.href}/`));

                  if (!item.enabled) {
                    return (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton
                          disabled
                          aria-disabled="true"
                          tooltip={`${item.label} — em breve`}
                          className="text-sidebar-foreground/40"
                        >
                          <Icon strokeWidth={1.75} />
                          <span>{item.label}</span>
                          <Badge
                            variant="muted"
                            className="ml-auto px-1.5 py-0 text-[10px] font-medium group-data-[collapsible=icon]:hidden"
                          >
                            Em breve
                          </Badge>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }

                  return (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                        className="text-sidebar-foreground/70 data-[active=true]:bg-primary/15 data-[active=true]:text-primary"
                      >
                        <Link
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => isMobile && setOpenMobile(false)}
                        >
                          <Icon strokeWidth={1.75} />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <UserMenu name={userName} email={userEmail} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
