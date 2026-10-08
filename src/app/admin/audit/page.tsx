import { ScrollText } from "lucide-react";
import { ComingSoon } from "@/components/admin/coming-soon";
import { requirePlatformAdmin } from "@/lib/admin/queries";

export const metadata = { title: "Auditoria" };

export default async function AdminAuditPage() {
  await requirePlatformAdmin();

  return (
    <ComingSoon
      icon={ScrollText}
      title="Auditoria"
      description="Registro das ações administrativas e dos eventos da plataforma."
    />
  );
}
