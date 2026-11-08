import type { Metadata } from "next";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { InstallAppCard } from "@/components/pwa/install-app-card";
import { getCurrentCompany } from "@/lib/companies/queries";
import { appSettingsNav } from "@/lib/settings/nav";

export const metadata: Metadata = { title: "Aplicativo" };

export default async function AppSettingsPage() {
  const { role } = (await getCurrentCompany())!;

  return (
    <SettingsPageShell title="Aplicativo" description="Use o Prime Ges como um aplicativo no celular." nav={appSettingsNav(role)}>
      <InstallAppCard />
    </SettingsPageShell>
  );
}
