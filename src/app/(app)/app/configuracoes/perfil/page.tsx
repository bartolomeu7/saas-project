import type { Metadata } from "next";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { ProfileSections } from "@/components/settings/account-sections";
import { getCurrentCompany } from "@/lib/companies/queries";
import { appSettingsNav } from "@/lib/settings/nav";

export const metadata: Metadata = { title: "Perfil" };

export default async function ProfileSettingsPage() {
  const { role } = (await getCurrentCompany())!;

  return (
    <SettingsPageShell title="Perfil" description="Seu nome, foto, e-mail e telefone." nav={appSettingsNav(role)}>
      <ProfileSections />
    </SettingsPageShell>
  );
}
