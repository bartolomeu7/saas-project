import type { Metadata } from "next";
import { getMaintenanceState } from "@/lib/maintenance-state";
import { MaintenanceScreen } from "@/components/maintenance/maintenance-screen";

export const metadata: Metadata = {
  title: "Em manutenção",
  robots: { index: false, follow: false },
};

// O estado muda sem nova publicação: nunca pode ser estática.
export const dynamic = "force-dynamic";

/**
 * Tela de manutenção. O middleware reescreve para cá (com status 503) toda página do produto enquanto uma manutenção
 * total está ativa. Aberta diretamente sem manutenção, devolve a pessoa ao sistema.
 */
export default async function MaintenancePage() {
  const state = await getMaintenanceState();
  return <MaintenanceScreen initial={state} />;
}
