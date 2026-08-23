"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "@/components/app/nav-items";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
      {NAV_GROUPS.map((group, index) => (
        <div key={group.label ?? `group-${index}`} className="flex flex-col gap-1">
          {group.label && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              {group.label}
            </p>
          )}

          {group.items.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/app" && pathname?.startsWith(`${item.href}/`));
            const Icon = item.icon;

            if (!item.enabled) {
              return (
                <span
                  key={item.label}
                  aria-disabled="true"
                  className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/35"
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                    {item.label}
                  </span>
                  <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-medium leading-none text-sidebar-foreground/45">
                    Em breve
                  </span>
                </span>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground"
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
