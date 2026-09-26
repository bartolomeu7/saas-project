"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { MoreHorizontal, X } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "@/config/marketing";
import { siteConfig } from "@/config/site";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeHref, setActiveHref] = useState("#topo");

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 16);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    const sections = NAV_LINKS.map((item) => document.getElementById(item.href.slice(1)))
      .filter((section): section is HTMLElement => Boolean(section));

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
  }, []);

  return (
    <header className={cn("prime-site-header", scrolled && "prime-site-header--scrolled")}>
      <div className="container flex h-16 items-center justify-between gap-6">
        <Link
          href="#topo"
          className="inline-flex items-center gap-2 font-semibold tracking-tight"
          aria-label="Prime Ges — início"
        >
          <Logo iconSize={24} />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Menu principal">
          {NAV_LINKS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              aria-current={activeHref === item.href ? "location" : undefined}
              className={cn(
                "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                activeHref === item.href && "text-foreground",
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href={siteConfig.links.login}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Entrar
          </Link>
          <Link
            href={siteConfig.links.register}
            className={cn(buttonVariants({ size: "sm" }), "prime-button-primary")}
          >
            Começar agora
          </Link>
        </div>

        <button
          type="button"
          className="prime-menu-button md:!hidden"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuOpen}
          aria-controls="prime-mobile-menu"
        >
          {menuOpen ? <X size={21} /> : <MoreHorizontal size={22} />}
        </button>
      </div>

      <div
        id="prime-mobile-menu"
        className={cn("prime-mobile-panel md:hidden", menuOpen && "prime-mobile-panel--open")}
        aria-hidden={!menuOpen}
      >
        <nav className="prime-mobile-menu-inner container" aria-label="Menu principal">
          {NAV_LINKS.map((item, index) => (
            <a
              key={item.label}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              aria-current={activeHref === item.href ? "location" : undefined}
              className={cn(
                "prime-mobile-link",
                activeHref === item.href && "prime-mobile-link--active",
              )}
              style={{ "--mobile-delay": index * 35 + "ms" } as CSSProperties}
            >
              {item.label}
            </a>
          ))}

          <div className="prime-mobile-actions">
            <Link
              href={siteConfig.links.login}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "prime-button-outline",
              )}
              onClick={() => setMenuOpen(false)}
            >
              Entrar
            </Link>
            <Link
              href={siteConfig.links.register}
              className={cn(buttonVariants({ size: "sm" }), "prime-button-primary")}
              onClick={() => setMenuOpen(false)}
            >
              Começar agora
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
