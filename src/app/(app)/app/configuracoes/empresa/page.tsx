import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CompanyEditForm } from "@/components/settings/company-edit-form";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { getCurrentCompany } from "@/lib/companies/queries";
import { appSettingsNav, canEditCompany } from "@/lib/settings/nav";

export const metadata: Metadata = { title: "Empresa" };

/** Nome e segmento da empresa. Funcionário não vê esta tela (volta para a visão geral); o banco confere o papel de novo. */
export default async function CompanySettingsPage() {
  const { company, role } = (await getCurrentCompany())!;
  if (!canEditCompany(role)) redirect("/app/configuracoes");

  return (
    <SettingsPageShell title="Empresa" description="Nome e segmento que aparecem no sistema." nav={appSettingsNav(role)}>
      <SettingsSection
        id="empresa-dados"
        title="Dados da empresa"
        description="Plano, assinatura e situação da empresa não mudam aqui."
        badge={<Badge variant={company.status === "active" ? "success" : "muted"}>{company.status === "active" ? "Ativa" : "Inativa"}</Badge>}
      >
        <CompanyEditForm name={company.name} businessType={company.business_type} />
      </SettingsSection>
    </SettingsPageShell>
  );
}
