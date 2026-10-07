import type { ReactNode } from "react";
import Link from "next/link";
import { BarChart3, Boxes, ShoppingCart, Users, Wallet } from "lucide-react";
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
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <main className="flex flex-col px-6 py-8 sm:px-10">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 rounded-md text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo iconSize={28} />
        </Link>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
            <Card className="border-border bg-card/80 shadow-card backdrop-blur">
              <CardHeader className="space-y-1.5">
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
      </main>

      <aside
        aria-hidden="true"
        className="relative hidden overflow-hidden border-l border-border lg:flex lg:flex-col lg:justify-center lg:px-14"
        style={{
          background:
            "radial-gradient(700px 420px at 15% 0%, hsl(var(--primary) / .18), transparent 60%), radial-gradient(600px 380px at 95% 90%, hsl(266 88% 62% / .10), transparent 62%), hsl(var(--sidebar-background))",
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
      </aside>
    </div>
  );
}
