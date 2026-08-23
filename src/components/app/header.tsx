"use client";

import { Menu } from "lucide-react";
import { NotificationButton } from "@/components/app/notification-button";
import { UserMenu } from "@/components/app/user-menu";
import { BUSINESS_TYPE_LABELS, type Company } from "@/types/company";

export function Header({
  company,
  userName,
  userEmail,
  onOpenMobileMenu,
}: {
  company: Company;
  userName?: string | null;
  userEmail?: string | null;
  onOpenMobileMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="text-muted-foreground hover:text-foreground lg:hidden"
            onClick={onOpenMobileMenu}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {company.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {BUSINESS_TYPE_LABELS[company.business_type]}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <NotificationButton />
          <div className="mx-1 h-6 w-px bg-border" />
          <UserMenu name={userName} email={userEmail} />
        </div>
      </div>
    </header>
  );
}
