import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { siteConfig } from "@/config/site";

interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

/**
 * Todos os links do rodapé têm destino real. Canal de contato e dados da empresa (razão social,
 * CNPJ, endereço) só entram aqui quando forem confirmados: hoje estão pendentes e aparecem como
 * [BLOCKED — DADO EMPRESARIAL NECESSÁRIO] nos documentos legais, não como texto inventado.
 */
const COLUMNS: FooterColumn[] = [
  {
    title: "Produto",
    links: [
      { label: "Recursos", href: "/#recursos" },
      { label: "Produto", href: "/#produto" },
      { label: "Para quem é", href: "/#segmentos" },
      { label: "Preços", href: "/#precos" },
      { label: "Perguntas frequentes", href: "/#faq" },
    ],
  },
  {
    title: "Conta",
    links: [
      { label: "Entrar", href: siteConfig.links.login },
      { label: "Criar conta", href: siteConfig.links.register },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Termos de Uso", href: "/termos-de-uso" },
      { label: "Política de Privacidade", href: "/politica-de-privacidade" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="container flex flex-col gap-10 py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 flex flex-col gap-3 sm:col-span-1">
            <span className="inline-flex items-center gap-2 font-semibold tracking-tight text-foreground">
              <Logo iconSize={22} />
            </span>
            <p className="max-w-[220px] text-sm text-muted-foreground">
              Gestão simples para pequenas empresas.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-foreground">{column.title}</p>
              <ul className="flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="inline-block rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {siteConfig.name}
        </p>
      </div>
    </footer>
  );
}
