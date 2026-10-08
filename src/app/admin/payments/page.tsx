import { ReceiptText } from "lucide-react";
import { ComingSoon } from "@/components/admin/coming-soon";
import { requirePlatformAdmin } from "@/lib/admin/queries";

export const metadata = { title: "Pagamentos" };

export default async function AdminPaymentsPage() {
  await requirePlatformAdmin();

  return (
    <ComingSoon
      icon={ReceiptText}
      title="Pagamentos"
      description="Histórico de pagamentos, pendências, confirmações e pagamentos manuais."
    />
  );
}
