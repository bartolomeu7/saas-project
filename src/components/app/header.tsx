"use client";

import { CommandMenu } from "@/components/app/command-menu";
import { NotificationButton } from "@/components/app/notification-button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BUSINESS_TYPE_LABELS, type Company } from "@/types/company";

export function Header({ company }: { company: Company }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger
            className="-ml-1 text-muted-foreground hover:text-foreground"
            aria-label="Abrir ou recolher o menu"
          />
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {company.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {BUSINESS_TYPE_LABELS[company.business_type]}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <CommandMenu businessType={company.business_type} />
          <NotificationButton />
        </div>
      </div>
    </header>
  );
}
