"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "@/config/marketing";
import { siteConfig } from "@/config/site";

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeHref, setActiveHref] = useState("#topo");

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 16);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

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

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Navegação principal">
          {NAV_LINKS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              aria-current={activeHref === item.href ? "location" : undefined}
              className={cn("prime-nav-link", activeHref === item.href && "prime-nav-link--active")}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href={siteConfig.links.login}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "prime-button-soft")}
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
          className="prime-menu-button lg:hidden"
          onClick={() => setMobileOpen((value) => !value)}
          aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={mobileOpen}
          aria-controls="prime-mobile-menu"
        >
          {mobileOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      <div
        id="prime-mobile-menu"
        className={cn("prime-mobile-panel lg:hidden", mobileOpen && "prime-mobile-panel--open")}
        aria-hidden={!mobileOpen}
      >
        <nav className="container flex flex-col gap-2 py-4" aria-label="Menu móvel">
          {NAV_LINKS.map((item, index) => (
            <a
              key={item.label}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={activeHref === item.href ? "location" : undefined}
              className={cn(
                "prime-mobile-link",
                activeHref === item.href && "prime-mobile-link--active",
              )}
              style={{ "--mobile-delay": index * 50 + "ms" } as CSSProperties}
            >
              {item.label}
            </a>
          ))}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link
              href={siteConfig.links.login}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "prime-button-outline",
              )}
              onClick={() => setMobileOpen(false)}
            >
              Entrar
            </Link>
            <Link
              href={siteConfig.links.register}
              className={cn(buttonVariants({ size: "sm" }), "prime-button-primary")}
              onClick={() => setMobileOpen(false)}
            >
              Começar agora
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
