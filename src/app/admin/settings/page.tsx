import { Settings } from "lucide-react";
import { ComingSoon } from "@/components/admin/coming-soon";
import { requireSuperAdmin } from "@/lib/admin/queries";

export const metadata = { title: "Configurações" };

export default async function AdminSettingsPage() {
  await requireSuperAdmin();

  return (
    <ComingSoon
      icon={Settings}
      title="Configurações"
      description="Administradores, permissões e configurações da plataforma."
    />
  );
}
