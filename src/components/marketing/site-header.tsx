"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "@/config/marketing";
import { siteConfig } from "@/config/site";

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link
          href="#topo"
          className="inline-flex items-center gap-2 font-semibold tracking-tight"
        >
          <Logo iconSize={24} />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href={siteConfig.links.login}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Entrar
          </Link>
          <Link
            href={siteConfig.links.register}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Criar conta
          </Link>
          <Link
            href={siteConfig.links.register}
            className={cn(buttonVariants({ size: "sm" }))}
          >
            Começar agora
          </Link>
        </div>

        <button
          type="button"
          className="text-muted-foreground hover:text-foreground lg:hidden"
          onClick={() => setMobileOpen((value) => !value)}
          aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/60 bg-background px-6 py-4 lg:hidden">
          <nav className="flex flex-col gap-3">
            {NAV_LINKS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href={siteConfig.links.login}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              onClick={() => setMobileOpen(false)}
            >
              Entrar
            </Link>
            <Link
              href={siteConfig.links.register}
              className={cn(buttonVariants({ size: "sm" }))}
              onClick={() => setMobileOpen(false)}
            >
              Começar agora
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
