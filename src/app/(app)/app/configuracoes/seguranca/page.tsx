import type { Metadata } from "next";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SecuritySections } from "@/components/settings/account-sections";
import { getCurrentCompany } from "@/lib/companies/queries";
import { appSettingsNav } from "@/lib/settings/nav";

export const metadata: Metadata = { title: "Segurança" };

export default async function SecuritySettingsPage() {
  const { role } = (await getCurrentCompany())!;

  return (
    <SettingsPageShell
      title="Segurança"
      description="Senha, verificação em duas etapas e os aparelhos conectados à sua conta."
      nav={appSettingsNav(role)}
    >
      <SecuritySections />
    </SettingsPageShell>
  );
}
