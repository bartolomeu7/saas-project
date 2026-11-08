import type { Metadata } from "next";
import Link from "next/link";
import { HrEmployeeForm } from "@/components/app/hr-employee-form";
import { NoAccess } from "@/components/app/no-access";
import { getCurrentCompany } from "@/lib/companies/queries";
import { createEmployeeAction } from "@/lib/hr/actions";
import { can } from "@/lib/permissions/matrix";

export const metadata: Metadata = { title: "Novo funcionário" };

export default async function NewEmployeePage() {
  const current = (await getCurrentCompany())!;
  if (!can(current.role, "hr.manage")) return <NoAccess area="o RH" />;
  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link href="/app/rh" className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Voltar para o RH</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Novo funcionário</h1>
        <p className="text-sm text-muted-foreground">Escolha o tipo: informal (controle básico) ou CLT (com folha estimada, INSS, IRRF e FGTS).</p>
      </div>
      <div className="max-w-3xl">
        <HrEmployeeForm action={createEmployeeAction} submitLabel="Salvar funcionário" />
      </div>
    </div>
  );
}
