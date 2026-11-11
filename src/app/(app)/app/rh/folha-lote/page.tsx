import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { NoAccess } from "@/components/app/no-access";
import { BatchPayrollForm } from "@/components/app/hr-batch-payroll-form";
import { getCurrentCompany } from "@/lib/companies/queries";
import { can } from "@/lib/permissions/matrix";
import { hasPaymentInMonth, listEmployees } from "@/lib/hr/queries";
import { daysInMonth } from "@/lib/hr/schedule";
import { MONTH_PATTERN } from "@/lib/hr/payroll-service";
import { formatCurrency } from "@/lib/format";
import { todayDateSaoPaulo } from "@/lib/timezone";
import { UserRoundCheck } from "lucide-react";

export const metadata: Metadata = { title: "Fechar folha em lote" };

function previousMonth(today: string): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

export default async function HrBatchPayrollPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ mes?: string }> }) {
  const searchParams = await searchParamsPromise;
  const current = (await getCurrentCompany())!;
  if (!can(current.role, "hr.manage")) return <NoAccess area="o RH" />;

  const today = todayDateSaoPaulo();
  const month = MONTH_PATTERN.test(searchParams?.mes ?? "") ? (searchParams.mes as string) : previousMonth(today);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)))).padStart(2, "0")}`;

  const all = (await listEmployees(current.company.id, { status: "active" })).filter((employee) => employee.mode === "clt" && (!employee.started_on || employee.started_on <= monthEnd));
  const checks = await Promise.all(all.map(async (employee) => ({ employee, closed: await hasPaymentInMonth(employee.id, monthStart, monthEnd) })));
  const pending = checks.filter((row) => !row.closed).map((row) => ({ id: row.employee.id, name: row.employee.full_name, salary: formatCurrency(row.employee.base_amount) }));
  const label = `${month.slice(5, 7)}/${month.slice(0, 4)}`;

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div><Link href="/app/rh" className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Voltar para o RH</Link></div>
      <PageHeader title={`Fechar folha de ${label}`} description="Funcionários CLT que ainda não têm a folha deste mês fechada." />
      <form className="flex items-end gap-2" method="get">
        <label className="grid gap-1 text-sm">Mês
          <input type="month" name="mes" defaultValue={month} className="h-10 rounded-md border bg-background px-3" />
        </label>
        <button type="submit" className="h-10 rounded-md border px-4 text-sm">Ver</button>
      </form>
      {pending.length === 0 ? (
        <EmptyState title="Nenhuma folha pendente neste mês." description="Todos os funcionários CLT ativos já têm a folha deste mês fechada." icon={UserRoundCheck} />
      ) : (
        <BatchPayrollForm key={month} month={month} employees={pending} />
      )}
    </div>
  );
}
