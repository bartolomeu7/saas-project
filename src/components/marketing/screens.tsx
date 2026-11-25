/**
 * Telas ILUSTRATIVAS do sistema no site público, em HTML (nada de imagem). Os dados são demonstrativos e a moldura
 * diz isso. Os números contam uma história só: uma venda de R$ 40,80 que aparece no estoque, no caixa, no financeiro
 * e na fidelidade. Sem estado: dá para usar em componentes de servidor e de cliente.
 */
import type { ReactNode } from "react";
import { Check, FileDown } from "lucide-react";
import type { ScreenId } from "@/config/marketing";
import { cn } from "@/lib/utils";

export function ScreenFrame({ module, children, className }: { module: string; children: ReactNode; className?: string }) {
  return (
    <figure className={cn("site-screen", className)} aria-label={`Tela ilustrativa do módulo ${module}, com dados demonstrativos`}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
          {module}
        </span>
        <span className="text-xs text-muted-foreground">dados demonstrativos</span>
      </div>
      <div className="flex flex-col gap-3 p-4 sm:p-5">{children}</div>
    </figure>
  );
}

function Line({ label, meta, value, tone }: { label: string; meta?: string; value: ReactNode; tone?: "success" | "warning" }) {
  return (
    <div className="site-pop flex items-center justify-between gap-3 rounded-lg bg-secondary/60 px-3 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-sm text-foreground">{label}</span>
        {meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}
      </span>
      <span
        className={cn(
          "shrink-0 text-sm font-semibold tabular-nums text-foreground",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-end justify-between gap-3 border-t border-border pt-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</span>
    </div>
  );
}

function Status({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-2 rounded-lg bg-success/15 px-3 py-2.5 text-sm font-semibold text-success">
      <Check className="h-4 w-4" aria-hidden="true" />
      {children}
    </p>
  );
}

export const SALE_ITEMS = [
  { label: "Pão francês", meta: "12 un × R$ 0,90", value: "R$ 10,80", cents: 1080 },
  { label: "Café coado", meta: "2 un × R$ 6,00", value: "R$ 12,00", cents: 1200 },
  { label: "Bolo de milho", meta: "1 un × R$ 18,00", value: "R$ 18,00", cents: 1800 },
];

/** `items` e `done` permitem mostrar a venda sendo montada (hero da home). */
export function SaleScreen({ items = SALE_ITEMS.length, done = true }: { items?: number; done?: boolean }) {
  const shown = SALE_ITEMS.slice(0, items);
  const total = shown.reduce((sum, item) => sum + item.cents, 0);
  return (
    <ScreenFrame module="Vendas">
      <div className="flex min-h-[10.5rem] flex-col gap-2">
        {shown.map((item) => (
          <Line key={item.label} label={item.label} meta={item.meta} value={item.value} />
        ))}
      </div>
      <Total label="Total · Pix" value={"R$ " + (total / 100).toFixed(2).replace(".", ",")} />
      {done ? (
        <Status>Venda concluída</Status>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-center text-sm text-muted-foreground">Adicionando itens…</p>
      )}
    </ScreenFrame>
  );
}

function StockScreen() {
  const rows = [
    { label: "Pão francês", before: 120, after: 108, max: 150 },
    { label: "Café em grãos (kg)", before: 9, after: 9, max: 12 },
    { label: "Bolo de milho", before: 6, after: 5, max: 20, low: true },
  ];
  return (
    <ScreenFrame module="Estoque">
      {rows.map((row) => (
        <div key={row.label} className="site-pop rounded-lg bg-secondary/60 px-3 py-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-foreground">{row.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {row.before !== row.after && <s className="mr-2">{row.before}</s>}
              <strong className={cn("text-foreground", row.low && "text-warning")}>{row.after}</strong>
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background" aria-hidden="true">
            <div className={cn("site-bar-x h-full rounded-full bg-primary", row.low && "bg-warning")} style={{ width: `${(row.after / row.max) * 100}%` }} />
          </div>
          {row.low && <p className="mt-2 text-xs font-medium text-warning">Estoque baixo</p>}
        </div>
      ))}
    </ScreenFrame>
  );
}

function CashScreen() {
  return (
    <ScreenFrame module="Caixa">
      <Line label="Abertura do caixa" meta="07:00" value="R$ 150,00" />
      <Line label="Venda no Pix" meta="09:14" value="+ R$ 40,80" tone="success" />
      <Line label="Sangria" meta="11:30 · troco" value="- R$ 50,00" />
      <Total label="Saldo esperado" value="R$ 140,80" />
    </ScreenFrame>
  );
}

function FinanceScreen() {
  return (
    <ScreenFrame module="Financeiro">
      <Line label="Receita da venda" meta="Vendas · hoje" value="+ R$ 40,80" tone="success" />
      <Line label="Fornecedor de farinha" meta="A pagar · vence sexta" value="R$ 320,00" tone="warning" />
      <Line label="Encomenda de festa" meta="A receber · sábado" value="R$ 260,00" />
      <Total label="Resultado do mês" value="R$ 4.318,40" />
    </ScreenFrame>
  );
}

function LoyaltyScreen() {
  return (
    <ScreenFrame module="Fidelidade">
      <Line label="Cliente identificado" meta="Nível Prata" value="+ 40 pontos" tone="success" />
      <div className="rounded-lg bg-secondary/60 px-3 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Rumo ao nível Ouro</span>
          <span className="tabular-nums text-foreground">380 / 500</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-background" aria-hidden="true">
          <div className="site-bar-x h-full w-[76%] rounded-full bg-[hsl(var(--site-accent))]" />
        </div>
      </div>
      <Line label="Campanha da semana" meta="Pontos em dobro na quinta" value="2×" />
    </ScreenFrame>
  );
}

function AgendaScreen() {
  const rows = [
    { time: "08:00", label: "Lavagem completa", meta: "Carlos · confirmado" },
    { time: "10:30", label: "Higienização interna", meta: "Bruna · agendado" },
    { time: "14:00", label: "Polimento", meta: "Carlos · concluído, venda gerada" },
  ];
  return (
    <ScreenFrame module="Agenda">
      {rows.map((row) => (
        <Line key={row.time} label={row.label} meta={row.meta} value={row.time} />
      ))}
    </ScreenFrame>
  );
}

function QuoteScreen() {
  return (
    <ScreenFrame module="Orçamentos">
      <Line label="Polimento e proteção de pintura" meta="1 serviço" value="R$ 450,00" />
      <Line label="Higienização de bancos" meta="1 serviço" value="R$ 180,00" />
      <Total label="Total · válido por 7 dias" value="R$ 630,00" />
      <p className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground">
        <FileDown className="h-4 w-4" aria-hidden="true" /> Baixar PDF
      </p>
    </ScreenFrame>
  );
}

function ReportScreen() {
  const days = [
    { day: "Seg", height: 46 },
    { day: "Ter", height: 58 },
    { day: "Qua", height: 52 },
    { day: "Qui", height: 71 },
    { day: "Sex", height: 86 },
    { day: "Sáb", height: 100 },
    { day: "Dom", height: 64 },
  ];
  return (
    <ScreenFrame module="Relatórios">
      <p className="text-sm text-muted-foreground">Faturamento por dia · últimos 7 dias</p>
      <div className="flex h-40 items-end gap-2" aria-hidden="true">
        {days.map((item, index) => (
          <div key={item.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <div className="site-bar-y w-full rounded-t-md bg-primary" style={{ height: `${item.height}%`, animationDelay: `${index * 60}ms` }} />
            <span className="text-xs text-muted-foreground">{item.day}</span>
          </div>
        ))}
      </div>
      <Total label="Ticket médio" value="R$ 27,60" />
    </ScreenFrame>
  );
}

function PurchaseScreen() {
  return (
    <ScreenFrame module="Compras">
      <Line label="Pedido #18 · Moinho" meta="Farinha de trigo, 8 sacos" value="R$ 320,00" />
      <Line label="Recebimento" meta="Estoque atualizado" value="+ 8" tone="success" />
      <Line label="Conta a pagar" meta="Criada no financeiro" value="sexta" tone="warning" />
      <Status>Mercadoria recebida</Status>
    </ScreenFrame>
  );
}

const SCREENS: Record<ScreenId, () => ReactNode> = {
  venda: () => <SaleScreen />,
  estoque: StockScreen,
  caixa: CashScreen,
  financeiro: FinanceScreen,
  fidelidade: LoyaltyScreen,
  agenda: AgendaScreen,
  orcamento: QuoteScreen,
  relatorios: ReportScreen,
  compra: PurchaseScreen,
};

export function ProductScreen({ id }: { id: ScreenId }) {
  const Screen = SCREENS[id];
  return <Screen />;
}
