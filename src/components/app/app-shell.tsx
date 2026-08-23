"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "@/components/app/sidebar";
import { Header } from "@/components/app/header";
import type { Company } from "@/types/company";

export function AppShell({
  company,
  userName,
  userEmail,
  children,
}: {
  company: Company;
  userName?: string | null;
  userEmail?: string | null;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background lg:flex">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Overlay do drawer mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="flex flex-1 flex-col lg:min-w-0">
        <Header
          company={company}
          userName={userName}
          userEmail={userEmail}
          onOpenMobileMenu={() => setMobileOpen(true)}
        />

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
