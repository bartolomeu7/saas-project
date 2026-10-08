"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
 * Cabeçalho público. Na Home (`isHome`) os links rolam até as seções e o item da seção visível
 * fica marcado (aria-current). Nas outras páginas públicas (Termos, Privacidade) os mesmos links
 * apontam para `/#secao`. O menu mobile é o Sheet do shadcn/ui (foco preso, Escape fecha, rótulos
 * corretos), no lugar do painel manual anterior.
 */
export function SiteHeader({ isHome = true }: { isHome?: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeHref, setActiveHref] = useState<string | null>(null);

  const hrefFor = (hash: string) => (isHome ? hash : "/" + hash);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 16);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!isHome) return;

    const sections = NAV_LINKS.map((item) => document.getElementById(item.href.slice(1))).filter(
      (section): section is HTMLElement => Boolean(section),
    );
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveHref("#" + visible.target.id);
      },
      { threshold: [0.15, 0.3, 0.55], rootMargin: "-12% 0px -55% 0px" },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [isHome]);

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
          href={isHome ? "#topo" : "/"}
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Prime Ges — início"
        >
          <Logo iconSize={24} />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Menu principal">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.label}
              href={hrefFor(item.href)}
              aria-current={isHome && activeHref === item.href ? "location" : undefined}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                isHome && activeHref === item.href && "text-foreground",
              )}
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

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu size={22} aria-hidden="true" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="flex w-[min(88vw,22rem)] flex-col gap-6">
            <SheetHeader className="text-left">
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription>Navegue pelas seções ou acesse a sua conta.</SheetDescription>
            </SheetHeader>
            <nav aria-label="Menu principal" className="flex flex-col gap-1">
              {NAV_LINKS.map((item) => (
                <SheetClose asChild key={item.label}>
                  <Link
                    href={hrefFor(item.href)}
                    aria-current={isHome && activeHref === item.href ? "location" : undefined}
                    className={cn(
                      "rounded-md px-3 py-3 text-base text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isHome && activeHref === item.href && "bg-primary/10 text-foreground",
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
    </header>
  );
}
