import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getFinanceWorkspace } from "@/lib/finance/queries";
import {
  createCostCenterAction,
  createFinancialCategoryAction,
  createFinancialEntryAction,
  payAccountsPayableAction,
  receiveSalePaymentAction,
} from "@/lib/finance/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

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
    <div className="prime-kpi-card rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
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
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3">Descrição</th>
                <th className="p-3">Fornecedor</th>
                <th className="p-3">Vencimento</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Saldo</th>
                <th className="p-3">Pagamento</th>
              </tr>
            </thead>
            <tbody>
              {payables.map((payable) => {
                const balance = Math.max(0, Number(payable.amount) - Number(payable.paid_amount));
                return (
                  <tr key={payable.id} className="border-b align-top last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium">{payable.description}</div>
                      <div className="text-xs text-muted-foreground">{payable.status}</div>
                    </td>
                    <td className="p-3">{(payable as typeof payable & { suppliers?: { name: string } | null }).suppliers?.name ?? "—"}</td>
                    <td className="p-3">{dateOnly(payable.due_date)}</td>
                    <td className="p-3 text-right">{money(Number(payable.amount))}</td>
                    <td className="p-3 text-right font-semibold">{money(balance)}</td>
                    <td className="p-3">
                      {canOperate ? (
                        <form action={payAccountsPayableAction} className="grid gap-2 sm:grid-cols-[120px_130px_110px_auto]">
                          <input type="hidden" name="payableId" value={payable.id} />
                          <input name="amount" defaultValue={balance.toFixed(2)} inputMode="decimal" className="h-9 rounded-md border bg-background px-2 text-sm" />
                          <select name="method" defaultValue="pix" className="h-9 rounded-md border bg-background px-2 text-sm">
                            {Object.entries(paymentLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                          </select>
                          <input name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0,10)} className="h-9 rounded-md border bg-background px-2 text-sm" />
                          <Button type="submit" size="sm">Baixar</Button>
                        </form>
                      ) : (
                        <span className="text-xs text-muted-foreground">Somente leitura</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
          <table className="w-full min-w-[850px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3">Venda</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Data</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Recebido</th>
                <th className="p-3 text-right">Saldo</th>
                <th className="p-3">Receber</th>
              </tr>
            </thead>
            <tbody>
              {receivables.map((row) => (
                <tr key={row.sale_id} className="border-b align-top last:border-0 hover:bg-muted/30">
                  <td className="p-3"><Link href={"/app/vendas/" + row.sale_id} className="font-medium hover:underline">{row.sale_id.slice(0, 8).toUpperCase()}</Link></td>
                  <td className="p-3">{row.customer_name ?? "Consumidor"}</td>
                  <td className="p-3">{dateOnly(row.sold_at)}</td>
                  <td className="p-3 text-right">{money(row.total_amount)}</td>
                  <td className="p-3 text-right">{money(row.paid_amount)}</td>
                  <td className="p-3 text-right font-semibold">{money(row.outstanding_amount)}</td>
                  <td className="p-3">
                    {canOperate ? (
                      <form action={receiveSalePaymentAction} className="grid gap-2 sm:grid-cols-[120px_120px_auto]">
                        <input type="hidden" name="saleId" value={row.sale_id} />
                        <input name="amount" defaultValue={row.outstanding_amount.toFixed(2)} inputMode="decimal" className="h-9 rounded-md border bg-background px-2 text-sm" />
                        <select name="method" defaultValue="pix" className="h-9 rounded-md border bg-background px-2 text-sm">
                          {Object.entries(paymentLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                        </select>
                        <Button type="submit" size="sm">Receber</Button>
                      </form>
                    ) : (
                      <span className="text-xs text-muted-foreground">Somente leitura</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              <form action={createFinancialEntryAction} className="mt-5 grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    Tipo
                    <select name="direction" defaultValue="expense" className="h-10 rounded-md border bg-background px-3">
                      <option value="expense">Despesa</option>
                      <option value="income">Receita</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    Valor
                    <input name="amount" required inputMode="decimal" placeholder="0,00" className="h-10 rounded-md border bg-background px-3" />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  Descrição
                  <input name="description" required placeholder="Ex.: energia elétrica" className="h-10 rounded-md border bg-background px-3" />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-sm">
                    Data
                    <input name="occurredOn" type="date" defaultValue={new Date().toISOString().slice(0,10)} className="h-10 rounded-md border bg-background px-3" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Forma
                    <select name="method" defaultValue="pix" className="h-10 rounded-md border bg-background px-3">
                      {Object.entries(paymentLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    Categoria
                    <select name="categoryId" className="h-10 rounded-md border bg-background px-3">
                      {categories.filter((c) => c.kind === "expense").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  Centro de custo
                  <select name="costCenterId" className="h-10 rounded-md border bg-background px-3">
                    {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  Observação
                  <textarea name="notes" rows={3} className="rounded-md border bg-background px-3 py-2" />
                </label>
                <Button type="submit">Registrar lançamento</Button>
              </form>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">Somente owner/admin podem registrar lançamentos.</p>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card">
            <div className="border-b p-4"><h2 className="font-semibold">Últimos lançamentos</h2></div>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Data</th><th className="p-3">Descrição</th><th className="p-3">Tipo</th><th className="p-3 text-right">Valor</th></tr></thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="p-3">{dateOnly(entry.occurred_on)}</td>
                    <td className="p-3"><div>{entry.description}</div><div className="text-xs text-muted-foreground">{entry.category_id ? "Categorizado" : "Sem categoria"}</div></td>
                    <td className="p-3">{directionLabels[entry.direction]}</td>
                    <td className={cn("p-3 text-right font-semibold", entry.direction === "income" ? "text-emerald-500" : "text-rose-500")}>
                      {entry.direction === "expense" ? "−" : "+"}{money(Number(entry.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            {canOperate && (
              <form action={createFinancialCategoryAction} className="mt-5 grid gap-3 sm:grid-cols-[1fr_150px_auto]">
                <input name="name" placeholder="Nova categoria" className="h-10 rounded-md border bg-background px-3" />
                <select name="kind" defaultValue="expense" className="h-10 rounded-md border bg-background px-3">
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                </select>
                <Button type="submit">Adicionar</Button>
              </form>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-base font-semibold">Centros de custo</h2>
            <div className="mt-4 grid gap-2">
              {costCenters.map((center) => (
                <div key={center.id} className="rounded-lg border px-3 py-2 text-sm">{center.name}</div>
              ))}
            </div>
            {canOperate && (
              <form action={createCostCenterAction} className="mt-5 flex gap-2">
                <input name="name" placeholder="Novo centro de custo" className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3" />
                <Button type="submit">Adicionar</Button>
              </form>
            )}
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
          <table className="w-full min-w-[680px] text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Data</th><th className="p-3">Descrição</th><th className="p-3">Forma</th><th className="p-3 text-right">Valor</th></tr></thead>
            <tbody>
              {entries.slice(0, 8).map((entry) => (
                <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">{dateOnly(entry.occurred_on)}</td>
                  <td className="p-3">{entry.description}</td>
                  <td className="p-3">{entry.method ? paymentLabels[entry.method] ?? entry.method : "—"}</td>
                  <td className={cn("p-3 text-right font-semibold", entry.direction === "income" ? "text-emerald-500" : "text-rose-500")}>
                    {entry.direction === "expense" ? "−" : "+"}{money(Number(entry.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!entries.length && <div className="p-10 text-center text-sm text-muted-foreground">Ainda não há movimentos financeiros. Conclua uma venda paga ou registre uma despesa.</div>}
        </div>
      </section>
    </PageShell>
  );
}
