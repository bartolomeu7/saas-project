import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { siteConfig } from "@/config/site";

interface FooterLink {
  label: string;
  href?: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

/**
 * Links sem `href` (Contato, Termos, Privacidade) apontariam para páginas
 * que ainda não existem — aparecem como texto simples em vez de um link
 * quebrado, para não prometer uma página que não existe.
 */
const COLUMNS: FooterColumn[] = [
  {
    title: "Soluções",
    links: [
      { label: "Recursos", href: "#recursos" },
      { label: "Preços", href: "#precos" },
      { label: "Para quem é", href: "#segmentos" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { label: "Início", href: "#topo" },
      { label: "Entrar", href: siteConfig.links.login },
      { label: "Criar conta", href: siteConfig.links.register },
    ],
  },
  {
    title: "Suporte",
    links: [{ label: "Contato" }],
  },
  {
    title: "Legal",
    links: [{ label: "Termos" }, { label: "Privacidade" }],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="container flex flex-col gap-10 py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 flex flex-col gap-3 sm:col-span-1">
            <span className="inline-flex items-center gap-2 font-semibold tracking-tight text-foreground">
              <Logo iconSize={22} />
            </span>
            <p className="max-w-[220px] text-sm text-muted-foreground">
              Gestão simples para pequenas empresas.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title} className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-foreground">
                {column.title}
              </p>
              <ul className="flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.href ? (
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground/50">
                        {link.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {siteConfig.name}
        </p>
      </div>
    </footer>
  );
}
