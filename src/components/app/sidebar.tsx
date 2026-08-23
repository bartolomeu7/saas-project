import Link from "next/link";
import { X } from "lucide-react";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";

export function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        <Link
          href="/app"
          className="inline-flex items-center gap-2 font-semibold tracking-tight"
        >
          <Logo iconSize={24} />
        </Link>
        <button
          className="text-sidebar-foreground/60 hover:text-sidebar-foreground lg:hidden"
          onClick={onClose}
          aria-label="Fechar menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <SidebarNav onNavigate={onClose} />
    </aside>
  );
}
