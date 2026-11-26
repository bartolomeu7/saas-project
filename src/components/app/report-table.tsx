import type { ReactNode } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface ReportColumn {
  label: string;
  /** Colunas de número ficam à direita. */
  numeric?: boolean;
}

export function ReportStat({ label, value, detail }: { label: string; value: ReactNode; detail: ReactNode }) {
  return (
    <article className="prime-kpi-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

/** Quadro com título e tabela, usado pelas abas dos Relatórios. */
export function ReportTable({
  title,
  description,
  columns,
  rows,
  empty,
  footer,
}: {
  title: string;
  description?: ReactNode;
  columns: ReportColumn[];
  rows: Array<{ key: string; cells: ReactNode[] }>;
  empty: string;
  footer?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/40">
      <div className="border-b p-4">
        <h2 className="font-semibold">{title}</h2>
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
      </div>
      <div className="overflow-x-auto">
        <Table className="w-full text-sm">
          <TableHeader className="bg-secondary/60 text-[11px] uppercase tracking-wider">
            <TableRow className="border-b text-left text-muted-foreground">
              {columns.map((column) => <TableHead key={column.label} className={cn("p-3", column.numeric && "text-right")}>{column.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key} className="border-b last:border-0">
                {row.cells.map((cell, index) => (
                  <TableCell key={columns[index]!.label} className={cn("p-3", columns[index]!.numeric ? "whitespace-nowrap text-right tabular-nums" : "max-w-[16rem] break-words")}>
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length ? <p className="p-10 text-center text-sm text-muted-foreground">{empty}</p> : null}
      </div>
      {footer ? <div className="border-t p-3 text-xs text-muted-foreground">{footer}</div> : null}
    </section>
  );
}
