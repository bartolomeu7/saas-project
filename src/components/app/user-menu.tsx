"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { ChevronsUpDown, CreditCard, LogOut, Users, type LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";

/** Botão "Sair" do menu do usuário: encerra a sessão do Clerk. */
function SignOutMenuItem() {
  const { signOut } = useClerk();
  const router = useRouter();

  return (
    <DropdownMenuItem
      className="cursor-pointer text-destructive focus:text-destructive"
      onSelect={(event) => {
        event.preventDefault();
        void signOut(() => router.push("/login"));
      }}
    >
      <LogOut className="size-4" strokeWidth={1.75} />
      Sair
    </DropdownMenuItem>
  );
}

function initialsFrom(name?: string | null, email?: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  if (email) {
    return email[0]?.toUpperCase() ?? "?";
  }
  return "?";
}

/**
 * Menu do usuário no rodapé da sidebar (padrão sidebar do shadcn/ui):
 * mostra identidade, atalhos para Equipe/Assinatura e o logout (Clerk).
 */
export interface UserMenuLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Atalhos padrão da área da empresa (/app). O painel /admin passa os seus. */
const DEFAULT_LINKS: UserMenuLink[] = [
  { href: "/app/equipe", label: "Equipe", icon: Users },
  { href: "/app/assinatura", label: "Assinatura", icon: CreditCard },
];

export function UserMenu({
  name,
  email,
  links = DEFAULT_LINKS,
}: {
  name?: string | null;
  email?: string | null;
  links?: UserMenuLink[];
}) {
  const { isMobile } = useSidebar();
  const initials = initialsFrom(name, email);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label="Menu do usuário"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name ?? email ?? "Usuário"}</span>
                {name && email && (
                  <span className="truncate text-xs text-sidebar-foreground/60">{email}</span>
                )}
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/50" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={8}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-semibold text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 leading-tight">
                  {name && <span className="truncate font-medium">{name}</span>}
                  {email && (
                    <span className="truncate text-xs text-muted-foreground">{email}</span>
                  )}
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {links.map(({ href, label, icon: Icon }) => (
              <DropdownMenuItem asChild key={href}>
                <Link href={href}>
                  <Icon className="size-4" strokeWidth={1.75} />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <SignOutMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
