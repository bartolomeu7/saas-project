import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Boxes, Check, ShoppingCart, Users, Wallet } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

/** Capacidades reais do produto (ver módulos em /app) mostradas no painel lateral. */
const HIGHLIGHTS = [
  { icon: Users, label: "Clientes, fidelidade e histórico em um só lugar" },
  { icon: ShoppingCart, label: "Vendas com itens, pagamentos e cancelamento" },
  { icon: Boxes, label: "Estoque, compras e fornecedores conectados" },
  { icon: Wallet, label: "Caixa e financeiro com contas a pagar e a receber" },
  { icon: BarChart3, label: "Relatórios com exportação em CSV" },
];

/** Fatos já publicados na Home (hero e chamada final), repetidos aqui como selos. */
const TRUST = ["Pagamento por Pix", "Sem renovação automática", "Sem instalar nada"];

const LEGAL_LINKS = [
  { label: "Termos de Uso", href: "/termos-de-uso" },
  { label: "Política de Privacidade", href: "/politica-de-privacidade" },
];

/**
 * Layout das telas de autenticação, baseado nos blocos de login do shadcn/ui:
 * formulário em Card à esquerda e, a partir de `lg`, um painel de marca à
 * direita. O conteúdo (formulários) continua vindo dos componentes de cada tela.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
  step,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Indicador de etapa (ex.: cadastro em 2 etapas). Só apresentação. */
  step?: { current: number; total: number };
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <main className="flex min-w-0 flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 rounded-md text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo iconSize={28} />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar ao site
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
            <Card className="relative overflow-hidden border-border bg-card/80 shadow-card backdrop-blur">
              <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary via-primary/60 to-transparent"
              />
              <CardHeader className="space-y-1.5 pt-7">
                {step && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Etapa {step.current} de {step.total}
                    </p>
                    <div className="mt-2 flex gap-1.5" aria-hidden="true">
                      {Array.from({ length: step.total }, (_, index) => (
                        <span
                          key={index}
                          className={
                            "h-1 flex-1 rounded-full " + (index < step.current ? "bg-primary" : "bg-border")
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
                <h1 className="text-xl font-semibold leading-none tracking-tight">{title}</h1>
                {description && <CardDescription>{description}</CardDescription>}
              </CardHeader>
              <CardContent>{children}</CardContent>
            </Card>

            {footer && (
              <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
            )}
          </div>
        </div>

        <nav
          aria-label="Documentos legais"
          className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground"
        >
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </main>

      <aside
        aria-hidden="true"
        className="relative hidden overflow-hidden border-l border-border lg:flex lg:flex-col lg:justify-center lg:px-14"
        style={{
          background:
            "linear-gradient(hsl(var(--foreground) / .035) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground) / .035) 1px, transparent 1px), radial-gradient(700px 420px at 15% 0%, hsl(var(--primary) / .22), transparent 60%), radial-gradient(600px 380px at 95% 90%, hsl(266 88% 62% / .12), transparent 62%), hsl(var(--sidebar-background))",
          backgroundSize: "44px 44px, 44px 44px, auto, auto, auto",
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Gestão para pequenos negócios
        </p>
        <h2 className="mt-3 max-w-md text-3xl font-semibold leading-tight tracking-tight text-foreground">
          Simples, organizada e em um só lugar.
        </h2>
        <ul className="mt-8 flex max-w-md flex-col gap-3">
          {HIGHLIGHTS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/50 px-4 py-3 text-sm text-foreground/90 backdrop-blur"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </span>
              {label}
            </li>
          ))}
        </ul>
        <ul className="mt-8 flex max-w-md flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {TRUST.map((item) => (
            <li key={item} className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-success" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
