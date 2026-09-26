import { MetricCard } from "@/components/app/metric-card";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getFinanceWorkspace } from "@/lib/finance/queries";
import {
  AccountsPayablePaymentForm,
  CostCenterForm,
  FinancialCategoryForm,
  FinancialEntryForm,
  SalePaymentForm,
} from "@/components/app/finance-action-forms";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const metadata: Metadata = { title: "Financeiro" };

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dateOnly = (value: string | null) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "—";

const paymentLabels: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit: "Débito",
  credit: "Crédito",
  other: "Outro",
};

const directionLabels = {
  income: "Receita",
  expense: "Despesa",
};

type SearchParams = Record<string, string | string[] | undefined>;

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <MetricCard label={label} value={value} detail={detail} />
  );
}

function NavTabs({ current }: { current: string }) {
  const tabs = [
    ["visao", "Visão geral"],
    ["pagar", "Contas a pagar"],
    ["receber", "Contas a receber"],
    ["lancamentos", "Receitas e despesas"],
    ["estrutura", "Categorias e centros"],
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map(([key, label]) => (
        <Link
          key={key}
          href={key === "visao" ? "/app/financeiro" : "/app/financeiro?view=" + key}
          className={cn(
            buttonVariants({ variant: current === key ? "default" : "outline", size: "sm" })
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

function PageShell({
  current,
  children,
}: {
  current: string;
  children: React.ReactNode;
}) {
  return (
    <div className="prime-module-page prime-module-page--financeiro flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Financeiro</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Visão financeira da empresa</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Caixa, contas, resultado e lançamentos conectados às vendas e compras reais.
          </p>
        </div>
        <NavTabs current={current} />
      </div>
      {children}
    </div>
  );
}

export default async function FinancePage({ searchParams }: { searchParams?: SearchParams }) {
  const current = (await getCurrentCompany())!;
  const workspace = await getFinanceWorkspace(current.company.id);
  const rawView = searchParams?.view;
  const requestedView = Array.isArray(rawView) ? rawView[0] : rawView;
  const view = requestedView ?? "visao";
  const { dashboard, payables, receivables, entries, categories, costCenters } = workspace;
  const canOperate = current.role === "owner" || current.role === "admin";

  if (view === "pagar") {
    return (
      <PageShell current="pagar">
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi label="Em aberto" value={money(dashboard.accountsPayable)} />
          <Kpi label="Vencidas" value={String(dashboard.overduePayableCount)} detail="contas vencidas" />
          <Kpi label="Itens" value={String(payables.length)} />
        </div>

        {!canOperate && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            Visualização liberada. Somente owner/admin podem registrar pagamentos.
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table className="w-full min-w-[900px] text-sm">
            <TableHeader>
              <TableRow className="border-b text-left text-muted-foreground">
                <TableHead className="p-3">Descrição</TableHead>
                <TableHead className="p-3">Fornecedor</TableHead>
                <TableHead className="p-3">Vencimento</TableHead>
                <TableHead className="p-3 text-right">Total</TableHead>
                <TableHead className="p-3 text-right">Saldo</TableHead>
                <TableHead className="p-3">Pagamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payables.map((payable) => {
                const balance = Math.max(0, Number(payable.amount) - Number(payable.paid_amount));
                return (
                  <TableRow key={payable.id} className="border-b align-top last:border-0 hover:bg-muted/30">
                    <TableCell className="p-3">
                      <div className="font-medium">{payable.description}</div>
                      <div className="text-xs text-muted-foreground">{payable.status}</div>
                    </TableCell>
                    <TableCell className="p-3">{(payable as typeof payable & { suppliers?: { name: string } | null }).suppliers?.name ?? "—"}</TableCell>
                    <TableCell className="p-3">{dateOnly(payable.due_date)}</TableCell>
                    <TableCell className="p-3 text-right">{money(Number(payable.amount))}</TableCell>
                    <TableCell className="p-3 text-right font-semibold">{money(balance)}</TableCell>
                    <TableCell className="p-3">
                      {canOperate ? (
                        <AccountsPayablePaymentForm payableId={payable.id} balance={balance} />
                      ) : (
                        <span className="text-xs text-muted-foreground">Somente leitura</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {!payables.length && <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma conta a pagar em aberto.</div>}
        </div>
      </PageShell>
    );
  }

  if (view === "receber") {
    return (
      <PageShell current="receber">
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi label="A receber" value={money(dashboard.accountsReceivable)} />
          <Kpi label="Vencidas" value={String(dashboard.overdueReceivableCount)} detail="vendas pendentes" />
          <Kpi label="Itens" value={String(receivables.length)} />
        </div>

        {!canOperate && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            Visualização liberada. Somente owner/admin podem registrar recebimentos.
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table className="w-full min-w-[850px] text-sm">
            <TableHeader>
              <TableRow className="border-b text-left text-muted-foreground">
                <TableHead className="p-3">Venda</TableHead>
                <TableHead className="p-3">Cliente</TableHead>
                <TableHead className="p-3">Data</TableHead>
                <TableHead className="p-3 text-right">Total</TableHead>
                <TableHead className="p-3 text-right">Recebido</TableHead>
                <TableHead className="p-3 text-right">Saldo</TableHead>
                <TableHead className="p-3">Receber</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receivables.map((row) => (
                <TableRow key={row.sale_id} className="border-b align-top last:border-0 hover:bg-muted/30">
                  <TableCell className="p-3"><Link href={"/app/vendas/" + row.sale_id} className="font-medium hover:underline">{row.sale_id.slice(0, 8).toUpperCase()}</Link></TableCell>
                  <TableCell className="p-3">{row.customer_name ?? "Consumidor"}</TableCell>
                  <TableCell className="p-3">{dateOnly(row.sold_at)}</TableCell>
                  <TableCell className="p-3 text-right">{money(row.total_amount)}</TableCell>
                  <TableCell className="p-3 text-right">{money(row.paid_amount)}</TableCell>
                  <TableCell className="p-3 text-right font-semibold">{money(row.outstanding_amount)}</TableCell>
                  <TableCell className="p-3">
                    {canOperate ? (
                      <SalePaymentForm saleId={row.sale_id} balance={row.outstanding_amount} />
                    ) : (
                      <span className="text-xs text-muted-foreground">Somente leitura</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!receivables.length && <div className="p-10 text-center text-sm text-muted-foreground">Nenhum recebível pendente.</div>}
        </div>
      </PageShell>
    );
  }

  if (view === "lancamentos") {
    return (
      <PageShell current="lancamentos">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-base font-semibold">Novo lançamento</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use para receitas/despesas que não passam por vendas ou compras.
            </p>
            {canOperate ? (
              <FinancialEntryForm categories={categories} costCenters={costCenters} />
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">Somente owner/admin podem registrar lançamentos.</p>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card">
            <div className="border-b p-4"><h2 className="font-semibold">Últimos lançamentos</h2></div>
            <Table className="w-full text-sm">
              <TableHeader><TableRow className="border-b text-left text-muted-foreground"><TableHead className="p-3">Data</TableHead><TableHead className="p-3">Descrição</TableHead><TableHead className="p-3">Tipo</TableHead><TableHead className="p-3 text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id} className="border-b last:border-0">
                    <TableCell className="p-3">{dateOnly(entry.occurred_on)}</TableCell>
                    <TableCell className="p-3"><div>{entry.description}</div><div className="text-xs text-muted-foreground">{entry.category_id ? "Categorizado" : "Sem categoria"}</div></TableCell>
                    <TableCell className="p-3">{directionLabels[entry.direction]}</TableCell>
                    <TableCell className={cn("p-3 text-right font-semibold", entry.direction === "income" ? "text-emerald-500" : "text-rose-500")}>
                      {entry.direction === "expense" ? "−" : "+"}{money(Number(entry.amount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </PageShell>
    );
  }

  if (view === "estrutura") {
    return (
      <PageShell current="estrutura">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-base font-semibold">Categorias financeiras</h2>
            <div className="mt-4 grid gap-2">
              {categories.map((category) => (
                <div key={category.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span>{category.name}</span>
                  <span className="text-xs text-muted-foreground">{category.kind === "income" ? "Receita" : "Despesa"}</span>
                </div>
              ))}
            </div>
            {canOperate && <FinancialCategoryForm />}
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-base font-semibold">Centros de custo</h2>
            <div className="mt-4 grid gap-2">
              {costCenters.map((center) => (
                <div key={center.id} className="rounded-lg border px-3 py-2 text-sm">{center.name}</div>
              ))}
            </div>
            {canOperate && <CostCenterForm />}
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell current="visao">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Faturamento" value={money(dashboard.revenue)} detail="vendas concluídas no mês" />
        <Kpi label="Custo dos produtos" value={money(dashboard.costOfGoods)} detail="CMV estimado pelas vendas" />
        <Kpi label="Resultado" value={money(dashboard.netResult)} detail="após despesas operacionais" />
        <Kpi label="Caixa do período" value={money(dashboard.cashNet)} detail={money(dashboard.cashIn) + " entrada • " + money(dashboard.cashOut) + " saída"} />
        <Kpi label="Saldo financeiro" value={money(dashboard.accountsReceivable - dashboard.accountsPayable)} detail="a receber − a pagar" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">DRE simplificada</h2>
              <p className="text-sm text-muted-foreground">Período atual, usando vendas e lançamentos reais.</p>
            </div>
            <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">Mês atual</span>
          </div>
          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-muted/40 p-4"><dt className="text-xs text-muted-foreground">Receita</dt><dd className="mt-1 text-lg font-semibold">{money(dashboard.revenue)}</dd></div>
            <div className="rounded-lg bg-muted/40 p-4"><dt className="text-xs text-muted-foreground">Custos</dt><dd className="mt-1 text-lg font-semibold">{money(dashboard.costOfGoods)}</dd></div>
            <div className="rounded-lg bg-muted/40 p-4"><dt className="text-xs text-muted-foreground">Despesas operacionais</dt><dd className="mt-1 text-lg font-semibold">{money(dashboard.operatingExpenses)}</dd></div>
          </dl>
          <div className="mt-5 flex items-center justify-between border-t pt-4">
            <span className="text-sm text-muted-foreground">Resultado do mês</span>
            <span className="text-2xl font-semibold">{money(dashboard.netResult)}</span>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Obrigações</h2>
          <div className="mt-4 grid gap-3">
            <Link href="/app/financeiro?view=pagar" className="rounded-lg border p-4 transition hover:-translate-y-0.5 hover:bg-muted/30">
              <div className="flex items-center justify-between"><span className="text-sm">Contas a pagar</span><span className="font-semibold">{money(dashboard.accountsPayable)}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{dashboard.overduePayableCount} vencidas</p>
            </Link>
            <Link href="/app/financeiro?view=receber" className="rounded-lg border p-4 transition hover:-translate-y-0.5 hover:bg-muted/30">
              <div className="flex items-center justify-between"><span className="text-sm">Contas a receber</span><span className="font-semibold">{money(dashboard.accountsReceivable)}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{dashboard.overdueReceivableCount} pendências vencidas</p>
            </Link>
          </div>
        </section>
      </div>

      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div><h2 className="font-semibold">Últimos movimentos financeiros</h2><p className="text-sm text-muted-foreground">Recebimentos de vendas e lançamentos registrados.</p></div>
          <Link href="/app/financeiro?view=lancamentos" className="text-sm font-medium text-primary hover:underline">Ver lançamentos</Link>
        </div>
        <div className="overflow-x-auto">
          <Table className="w-full min-w-[680px] text-sm">
            <TableHeader><TableRow className="border-b text-left text-muted-foreground"><TableHead className="p-3">Data</TableHead><TableHead className="p-3">Descrição</TableHead><TableHead className="p-3">Forma</TableHead><TableHead className="p-3 text-right">Valor</TableHead></TableRow></TableHeader>
            <TableBody>
              {entries.slice(0, 8).map((entry) => (
                <TableRow key={entry.id} className="border-b last:border-0 hover:bg-muted/30">
                  <TableCell className="p-3">{dateOnly(entry.occurred_on)}</TableCell>
                  <TableCell className="p-3">{entry.description}</TableCell>
                  <TableCell className="p-3">{entry.method ? paymentLabels[entry.method] ?? entry.method : "—"}</TableCell>
                  <TableCell className={cn("p-3 text-right font-semibold", entry.direction === "income" ? "text-emerald-500" : "text-rose-500")}>
                    {entry.direction === "expense" ? "−" : "+"}{money(Number(entry.amount))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!entries.length && <div className="p-10 text-center text-sm text-muted-foreground">Ainda não há movimentos financeiros. Conclua uma venda paga ou registre uma despesa.</div>}
        </div>
      </section>
    </PageShell>
  );
}
