import { Users, ShoppingCart, DollarSign, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Representação estilizada do produto real (não é screenshot nem imagem
 * genérica de estoque) — construída com os mesmos tokens de cor do
 * Prime Ges, para dar ao visitante uma ideia fiel da interface sem
 * depender de capturas de tela reais.
 */

const MINI_STATS = [
  { label: "Clientes", value: "128", icon: Users },
  { label: "Vendas", value: "—", icon: ShoppingCart },
  { label: "Faturamento", value: "—", icon: DollarSign },
  { label: "Serviços", value: "—", icon: Wrench },
];

const MINI_CUSTOMERS = [
  { name: "Ana Souza", detail: "(11) 9 8888-0000", status: "Ativo" },
  { name: "Carlos Lima", detail: "(21) 9 7777-1111", status: "Ativo" },
  { name: "Fernanda Alves", detail: "(31) 9 6666-2222", status: "Ativo" },
];

const MINI_MODULES = [
  { label: "Clientes", icon: Users, active: true },
  { label: "Vendas", icon: ShoppingCart, active: false },
  { label: "Financeiro", icon: DollarSign, active: false },
  { label: "Serviços", icon: Wrench, active: false },
];

function MockChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/40" />
      </div>
      <div className="flex">
        <div className="hidden w-12 shrink-0 flex-col items-center gap-3 border-r border-border bg-sidebar py-4 sm:flex">
          <span className="h-2 w-6 rounded-full bg-primary/70" />
          <span className="h-2 w-6 rounded-full bg-white/10" />
          <span className="h-2 w-6 rounded-full bg-white/10" />
          <span className="h-2 w-6 rounded-full bg-white/10" />
        </div>
        <div className="flex-1 p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function MockHeaderBar() {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="space-y-1.5">
        <div className="h-2.5 w-28 rounded-full bg-foreground/25" />
        <div className="h-2 w-20 rounded-full bg-foreground/10" />
      </div>
      <span className="h-7 w-7 shrink-0 rounded-full bg-primary/20" />
    </div>
  );
}

function DashboardMock() {
  return (
    <>
      <MockHeaderBar />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {MINI_STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-background/40 p-2.5"
          >
            <stat.icon className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
            <p className="mt-2 text-sm font-semibold text-foreground">
              {stat.value}
            </p>
            <p className="text-[10px] text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-end gap-1.5 rounded-lg border border-border bg-background/40 p-3">
        {[40, 65, 35, 80, 55, 70, 45].map((height, i) => (
          <span
            key={i}
            className="w-full rounded-sm bg-primary/50"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </>
  );
}

function ClientesMock() {
  return (
    <>
      <MockHeaderBar />
      <div className="space-y-2">
        {MINI_CUSTOMERS.map((customer) => (
          <div
            key={customer.name}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-background/40 p-2.5"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
              {customer.name[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">
                {customer.name}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {customer.detail}
              </p>
            </div>
            <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success">
              {customer.status}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function GestaoMock() {
  return (
    <>
      <MockHeaderBar />
      <div className="grid grid-cols-2 gap-2.5">
        {MINI_MODULES.map((module) => (
          <div
            key={module.label}
            className={cn(
              "flex items-center gap-2 rounded-lg border p-2.5",
              module.active
                ? "border-primary/30 bg-primary/10"
                : "border-border bg-background/40"
            )}
          >
            <module.icon
              className={cn(
                "h-3.5 w-3.5",
                module.active ? "text-primary" : "text-muted-foreground"
              )}
              strokeWidth={1.75}
            />
            <span
              className={cn(
                "text-[11px] font-medium",
                module.active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {module.label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 space-y-1.5 rounded-lg border border-border bg-background/40 p-3">
        <div className="h-2 w-full rounded-full bg-foreground/10" />
        <div className="h-2 w-4/5 rounded-full bg-foreground/10" />
        <div className="h-2 w-3/5 rounded-full bg-foreground/10" />
      </div>
    </>
  );
}

export function ProductMockup({
  variant = "dashboard",
  className,
}: {
  variant?: "dashboard" | "clientes" | "gestao";
  className?: string;
}) {
  return (
    <div className={className}>
      <MockChrome>
        {variant === "dashboard" && <DashboardMock />}
        {variant === "clientes" && <ClientesMock />}
        {variant === "gestao" && <GestaoMock />}
      </MockChrome>
    </div>
  );
}
