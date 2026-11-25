"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "@/config/marketing";
import { siteConfig } from "@/config/site";

/**
 * Cabeçalho público. Cada item do menu é uma página própria; a página atual fica marcada (aria-current). O menu
 * mobile é o Sheet do shadcn/ui (foco preso, Escape fecha, rótulos corretos).
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 16);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className={cn("prime-site-header", scrolled && "prime-site-header--scrolled")}>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>

      <div className="container flex h-16 items-center justify-between gap-6">
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Prime Ges — início"
        >
          <Logo iconSize={24} />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Menu principal">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className="site-nav-link"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link href={siteConfig.links.login} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Entrar
          </Link>
          <Link href={siteConfig.links.register} className={cn(buttonVariants({ size: "sm" }), "prime-cta")}>
            Criar conta
          </Link>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
        {/* CTA sempre à mão no celular (antes só existia dentro do menu). */}
        <Link
          href={siteConfig.links.register}
          className={cn(buttonVariants({ size: "sm" }), "prime-cta h-11 px-4")}
        >
          Criar conta
        </Link>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Abrir menu"
            >
              <Menu size={22} aria-hidden="true" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="flex w-[min(88vw,22rem)] flex-col gap-6">
            <SheetHeader className="text-left">
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription>Navegue pelas páginas ou acesse a sua conta.</SheetDescription>
            </SheetHeader>
            <nav aria-label="Menu principal" className="flex flex-col gap-1">
              {NAV_LINKS.map((item) => (
                <SheetClose asChild key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={pathname === item.href ? "page" : undefined}
                    className={cn(
                      "rounded-md px-3 py-3 text-base text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      pathname === item.href && "bg-primary/10 text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </SheetClose>
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-2">
              <SheetClose asChild>
                <Link href={siteConfig.links.register} className={cn(buttonVariants({ size: "lg" }), "prime-cta w-full")}>
                  Criar conta
                </Link>
              </SheetClose>
              <SheetClose asChild>
                <Link href={siteConfig.links.login} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}>
                  Entrar
                </Link>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
        </div>
      </div>
    </header>
  );
}
