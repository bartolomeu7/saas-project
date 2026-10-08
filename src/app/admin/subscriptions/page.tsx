import { CreditCard } from "lucide-react";
import { ComingSoon } from "@/components/admin/coming-soon";
import { requirePlatformAdmin } from "@/lib/admin/queries";

export const metadata = { title: "Assinaturas" };

export default async function AdminSubscriptionsPage() {
  await requirePlatformAdmin();

  return (
    <ComingSoon
      icon={CreditCard}
      title="Assinaturas"
      description="Acompanhamento de assinaturas ativas, expiradas e em teste, e gestão manual de acesso."
    />
  );
}
