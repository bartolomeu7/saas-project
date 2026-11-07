import type { Metadata } from "next";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { AppearanceSection } from "@/components/settings/account-sections";
import { getCurrentCompany } from "@/lib/companies/queries";
import { appSettingsNav } from "@/lib/settings/nav";

export const metadata: Metadata = { title: "Aparência" };

export default async function AppearanceSettingsPage() {
  const { role } = (await getCurrentCompany())!;

  return (
    <SettingsPageShell title="Aparência" description="Como o sistema aparece para você." nav={appSettingsNav(role)}>
      <AppearanceSection />
    </SettingsPageShell>
  );
}
