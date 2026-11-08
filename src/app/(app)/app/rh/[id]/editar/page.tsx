import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HrEmployeeForm } from "@/components/app/hr-employee-form";
import { NoAccess } from "@/components/app/no-access";
import { getCurrentCompany } from "@/lib/companies/queries";
import { updateEmployeeAction } from "@/lib/hr/actions";
import { getEmployee, getEmployeeClt } from "@/lib/hr/queries";
import { can } from "@/lib/permissions/matrix";

export const metadata: Metadata = { title: "Editar funcionário" };

export default async function EditEmployeePage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const { id } = await paramsPromise;
  const current = (await getCurrentCompany())!;
  if (!can(current.role, "hr.manage")) return <NoAccess area="o RH" />;
  const employee = await getEmployee(current.company.id, id);
  if (!employee) notFound();
  const clt = employee.mode === "clt" ? await getEmployeeClt(employee.id) : null;

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link href={`/app/rh/${employee.id}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Voltar para {employee.full_name}</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Editar funcionário</h1>
        <p className="text-sm text-muted-foreground">Mudanças de valor e de dia de pagamento valem para os próximos fechamentos; o que já foi fechado não muda.</p>
      </div>
      <div className="max-w-3xl">
        <HrEmployeeForm
          action={updateEmployeeAction.bind(null, employee.id)}
          submitLabel="Salvar alterações"
          mode={employee.mode}
          modeLocked
          defaultValues={{
            full_name: employee.full_name,
            birth_date: employee.birth_date ?? "",
            started_on: employee.started_on ?? "",
            phone: employee.phone ?? "",
            role_title: employee.role_title ?? "",
            pix_key: employee.pix_key ?? "",
            rate_kind: employee.rate_kind,
            base_amount: employee.base_amount.toFixed(2).replace(".", ","),
            pay_frequency: employee.pay_frequency,
            pay_weekday: employee.pay_weekday === null ? "" : String(employee.pay_weekday),
            pay_day_of_month: employee.pay_day_of_month === null ? "" : String(employee.pay_day_of_month),
            notes: employee.notes ?? "",
            clt_weekly_hours: clt ? String(clt.weekly_hours) : "",
            clt_contract_type: clt?.contract_type ?? "indefinite",
            clt_experience_days: clt?.experience_days ? String(clt.experience_days) : "",
            clt_contract_end_on: clt?.contract_end_on ?? "",
            clt_dependents: clt ? String(clt.dependents) : "0",
            clt_vt_enabled: clt?.vt_enabled ? "on" : "",
            clt_vt_monthly_cost: clt?.vt_monthly_cost ? clt.vt_monthly_cost.toFixed(2).replace(".", ",") : "",
          }}
        />
      </div>
    </div>
  );
}
