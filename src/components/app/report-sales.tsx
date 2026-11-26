import Link from "next/link";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { getSalesReport } from "@/lib/reports/sales-queries";
import { MAX_ITEM_SEARCH, salesQuery, type SalesFilters } from "@/lib/reports/sales";
import { formatCurrency } from "@/lib/format";
import { formatQuantity } from "@/lib/products/stock-labels";
import type { ReportRange } from "@/types/report";

const percent = (value: number | null) => (value === null ? "—" : value.toLocaleString("pt-BR") + "%");

/** Aba Vendas dos Relatórios: todos os itens com margem, filtros e quem registrou. Só leitura. */
export async function ReportSales({ companyId, range, filters }: { companyId: string; range: ReportRange; filters: SalesFilters }) {
  const report = await getSalesReport(companyId, range, filters);
  // o período segue junto quando a pessoa filtra ou limpa o filtro
  const periodParams: Record<string, string> =
    range.period === "custom" ? { period: "custom", from: range.fromDate, to: range.toDate } : { period: range.period };
  const href = (next: Partial<SalesFilters>) =>
    "/app/relatorios?" + new URLSearchParams(periodParams).toString() + "&" + salesQuery({ ...filters, ...next });
  const filtered = Boolean(filters.item || filters.customer || filters.seller);

  return (
    <>
      {/* a chave refaz os campos quando o filtro muda por um link: sem ela o campo guarda o valor antigo */}
      <form key={href({})} method="get" action="/app/relatorios" aria-label="Filtros das vendas" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="aba" value="vendas" />
        {Object.entries(periodParams).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        <label className="grid gap-1 text-xs text-muted-foreground">
          Item
          <input type="search" name="item" defaultValue={filters.item} maxLength={MAX_ITEM_SEARCH} placeholder="Parte do nome" className="h-10 w-48 rounded-md border border-input bg-background px-3 text-sm text-foreground" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Cliente
          <NativeSelect name="cliente" defaultValue={filters.customer} className="w-56">
            <option value="">Todos</option>
            <option value="sem">Vendas sem cliente</option>
            {report.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Registrada por
          <NativeSelect name="quem" defaultValue={filters.seller} className="w-48">
            <option value="">Todos</option>
            {report.sellers.map((seller) => <option key={seller.userId} value={seller.userId}>{seller.name}</option>)}
            {/* mantém a escolha visível quando o período não tem venda dessa pessoa */}
            {filters.seller && !report.sellers.some((seller) => seller.userId === filters.seller) ? <option value={filters.seller}>Selecionado</option> : null}
          </NativeSelect>
        </label>
        <button type="submit" className="h-10 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-secondary">Filtrar</button>
        {filtered ? <Link href={href({ item: "", customer: "", seller: "" })} className="py-2 text-sm font-medium text-primary hover:underline">Limpar filtros</Link> : null}
      </form>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="prime-kpi-card"><p>Faturamento</p><strong>{formatCurrency(report.revenue)}</strong><span>{report.sales} venda(s) concluída(s)</span></article>
        <article className="prime-kpi-card"><p>Custo</p><strong>{formatCurrency(report.cost)}</strong><span>custo gravado em cada venda</span></article>
        <article className="prime-kpi-card"><p>Margem</p><strong>{formatCurrency(report.margin)}</strong><span>{percent(report.marginPercent)} do faturamento</span></article>
        <article className="prime-kpi-card">
          <p>Descontos nas vendas</p>
          <strong>{filters.item ? "—" : formatCurrency(report.discounts)}</strong>
          <span>{filters.item ? "não se dividem por item" : "já descontados do faturamento"}</span>
        </article>
      </section>

      {filters.item ? (
        <p role="status" className="text-sm text-muted-foreground">Com filtro de item, os valores consideram só os itens que combinam, antes dos descontos da venda.</p>
      ) : null}
      {report.uncostedItems > 0 ? (
        <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          {report.uncostedItems} item(ns) com venda sem custo cadastrado ({formatCurrency(report.uncostedRevenue)}): a margem aparece maior do que é.
        </p>
      ) : null}

      <section className="rounded-xl border border-border bg-card/40">
        <div className="border-b p-4">
          <h2 className="font-semibold">Itens vendidos</h2>
          <p className="text-sm text-muted-foreground">Valores por item, antes dos descontos dados na venda inteira.</p>
        </div>
        <div className="overflow-x-auto">
          <Table className="w-full min-w-[640px] text-sm">
            <TableHeader className="bg-secondary/60 text-[11px] uppercase tracking-wider">
              <TableRow className="border-b text-left text-muted-foreground">
                <TableHead className="p-3">Item</TableHead>
                <TableHead className="p-3 text-right">Qtd.</TableHead>
                <TableHead className="p-3 text-right">Faturamento</TableHead>
                <TableHead className="p-3 text-right">Custo</TableHead>
                <TableHead className="p-3 text-right">Margem</TableHead>
                <TableHead className="p-3 text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.items.map((item) => (
                <TableRow key={item.itemType + ":" + item.description} className="border-b last:border-0">
                  <TableCell className="p-3">
                    <div className="max-w-[18rem] break-words font-medium">{item.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.itemType === "service" ? "Serviço" : "Produto"}
                      {item.uncosted !== "none" ? <span className="text-amber-700 dark:text-amber-400"> · {item.uncosted === "all" ? "sem custo" : "parte sem custo"}</span> : null}
                    </div>
                  </TableCell>
                  <TableCell className="p-3 text-right tabular-nums">{formatQuantity(item.quantity)}</TableCell>
                  <TableCell className="whitespace-nowrap p-3 text-right tabular-nums">{formatCurrency(item.revenue)}</TableCell>
                  <TableCell className="whitespace-nowrap p-3 text-right tabular-nums">{formatCurrency(item.cost)}</TableCell>
                  <TableCell className="whitespace-nowrap p-3 text-right font-semibold tabular-nums">{formatCurrency(item.margin)}</TableCell>
                  <TableCell className="p-3 text-right tabular-nums">{percent(item.marginPercent)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!report.items.length ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhuma venda concluída com esses filtros.</p> : null}
        </div>
      </section>

      {report.sellers.length ? (
        <section className="rounded-xl border border-border bg-card/40">
          <div className="border-b p-4"><h2 className="font-semibold">Por quem registrou a venda</h2></div>
          <div className="overflow-x-auto">
            <Table className="w-full text-sm">
              <TableHeader className="bg-secondary/60 text-[11px] uppercase tracking-wider">
                <TableRow className="border-b text-left text-muted-foreground">
                  <TableHead className="p-3">Pessoa</TableHead>
                  <TableHead className="p-3 text-right">Vendas</TableHead>
                  <TableHead className="p-3 text-right">Faturamento</TableHead>
                  <TableHead className="hidden p-3 text-right sm:table-cell">Margem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.sellers.map((seller) => (
                  <TableRow key={seller.userId} className="border-b last:border-0">
                    <TableCell className="p-3"><Link href={href({ seller: seller.userId })} className="font-medium hover:underline">{seller.name}</Link></TableCell>
                    <TableCell className="p-3 text-right tabular-nums">{seller.sales}</TableCell>
                    <TableCell className="whitespace-nowrap p-3 text-right tabular-nums">{formatCurrency(seller.revenue)}</TableCell>
                    <TableCell className="hidden whitespace-nowrap p-3 text-right tabular-nums sm:table-cell">{formatCurrency(seller.margin)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </>
  );
}
