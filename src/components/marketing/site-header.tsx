"use client";

import { useEffect, useState } from "react";
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

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={cn("prime-site-header", scrolled && "prime-site-header--scrolled")}>
      <div className="container prime-site-header__inner">
        <Link href="#topo" className="inline-flex items-center gap-2 font-semibold tracking-tight" aria-label="Prime Ges — início">
          <Logo iconSize={24} />
          <span>Prime Ges</span>
        </Link>

        <button
          type="button"
          className="prime-menu-trigger"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuOpen}
          aria-controls="prime-menu-panel"
        >
          {menuOpen ? <X size={22} strokeWidth={1.8} /> : <MoreHorizontal size={24} strokeWidth={1.8} />}
        </button>
      </div>

      {menuOpen && <button type="button" className="prime-menu-backdrop" aria-label="Fechar menu" onClick={closeMenu} />}

      <div id="prime-menu-panel" className={cn("prime-menu-panel", menuOpen && "is-open")} aria-hidden={!menuOpen}>
        <nav className="prime-menu-panel__nav" aria-label="Navegação principal">
          {NAV_LINKS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              onClick={closeMenu}
              aria-current={activeHref === item.href ? "location" : undefined}
              className={cn("prime-menu-link", activeHref === item.href && "prime-menu-link--active")}
            >
              <span>{item.label}</span>
              <span aria-hidden="true">↗</span>
            </a>
          ))}
        </nav>

        <div className="prime-menu-actions">
          <Link
            href={siteConfig.links.login}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "prime-menu-button prime-menu-button--ghost")}
            onClick={closeMenu}
          >
            Entrar
          </Link>
          <Link
            href={siteConfig.links.register}
            className={cn(buttonVariants({ size: "sm" }), "prime-menu-button prime-menu-button--primary")}
            onClick={closeMenu}
          >
            Começar agora
          </Link>
        </div>
      </div>
    </header>
  );
}
