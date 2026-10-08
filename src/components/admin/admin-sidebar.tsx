"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ADMIN_NAV_GROUPS } from "@/components/admin/admin-nav-items";
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
import type { UserRole } from "@/types/profile";

const ADMIN_USER_LINKS = [{ href: "/app", label: "Voltar ao Prime Ges", icon: ArrowLeft }];

/**
 * Sidebar do painel da plataforma. Estrutura do bloco `sidebar-07` do shadcn/ui
 * (recolhe para ícones; drawer no mobile) — a mesma base do AppSidebar da
 * empresa, mas com o menu global de /admin e sem dependência de `company`.
 */
export function AdminSidebar({
  userName,
  userEmail,
  role,
}: {
  userName?: string | null;
  userEmail?: string | null;
  role: UserRole;
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  // Esconde o que o papel não pode usar (UX). A autorização real é do banco.
  const groups = ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.superAdminOnly || role === "super_admin"),
  })).filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-3">
        <Link
          href="/admin"
          onClick={() => isMobile && setOpenMobile(false)}
          className="flex items-center gap-2 rounded-md px-1 font-semibold tracking-tight outline-none ring-sidebar-ring focus-visible:ring-2"
          aria-label={`${siteConfig.name} Admin — ir para o Dashboard`}
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
          <span className="flex items-center gap-2 truncate group-data-[collapsible=icon]:hidden">
            {siteConfig.name}
            <Badge variant="info" className="px-1.5 py-0 text-[10px] font-medium">
              Admin
            </Badge>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0 py-2">
        {groups.map((group, index) => (
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
                    (item.href !== "/admin" && !!pathname?.startsWith(`${item.href}/`));

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.soon ? `${item.label} — em breve` : item.label}
                        className="text-sidebar-foreground/70 data-[active=true]:bg-primary/15 data-[active=true]:text-[hsl(207_100%_68%)]"
                      >
                        <Link
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => isMobile && setOpenMobile(false)}
                        >
                          <Icon strokeWidth={1.75} />
                          <span>{item.label}</span>
                          {item.soon && (
                            <Badge
                              variant="muted"
                              className="ml-auto px-1.5 py-0 text-[10px] font-medium group-data-[collapsible=icon]:hidden"
                            >
                              Em breve
                            </Badge>
                          )}
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
        <UserMenu name={userName} email={userEmail} links={ADMIN_USER_LINKS} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
