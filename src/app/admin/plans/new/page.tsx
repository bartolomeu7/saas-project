import { PageHeader } from "@/components/app/page-header";
import { requireSuperAdmin } from "@/lib/admin/queries";
import { PlanEditor } from "../plan-editor";

export const metadata = { title: "Novo plano" };

/** Criar plano — SUPER_ADMIN ONLY (a Server Action e a RPC admin_save_plan revalidam no servidor e no banco). */
export default async function NewPlanPage() {
  await requireSuperAdmin();
  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader eyebrow="Planos" title="Novo plano" description="Defina preço, limites e benefícios. Planos não são excluídos: apenas desativados." />
      <PlanEditor />
    </div>
  );
}
