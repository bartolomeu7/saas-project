import type { Metadata } from "next";
import Link from "next/link";
import { HrSettingsForm } from "@/components/app/hr-forms";
import { NoAccess } from "@/components/app/no-access";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getHrSettings } from "@/lib/hr/queries";
import { can } from "@/lib/permissions/matrix";

export const metadata: Metadata = { title: "Configurações do RH" };

export default async function HrSettingsPage() {
  const current = (await getCurrentCompany())!;
  if (!can(current.role, "hr.manage")) return <NoAccess area="o RH" />;
  const settings = await getHrSettings(current.company.id);
  const percent = settings.employer_inss_rate > 0 ? (settings.employer_inss_rate * 100).toFixed(2).replace(".", ",") : "";

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link href="/app/rh" className="text-sm text-muted-foreground underline-offset-4 hover:underline">← Voltar para o RH</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Configurações do RH</h1>
        <p className="text-sm text-muted-foreground">Usado para estimar o custo da empresa com funcionários CLT (INSS patronal e FGTS). Em caso de dúvida, pergunte ao seu contador.</p>
      </div>
      <div className="max-w-2xl">
        <HrSettingsForm regime={settings.employer_regime} inssPercent={percent} />
      </div>
    </div>
  );
}
