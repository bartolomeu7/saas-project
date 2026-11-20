import "server-only";

import { createSessionClient } from "@/lib/supabase/server";
import type { MaintenanceLevel } from "@/lib/maintenance-gate";

export type MaintenanceStatus = "scheduled" | "active" | "completed" | "cancelled";

export interface MaintenanceWindowRow {
  id: string;
  title: string;
  message: string;
  level: MaintenanceLevel;
  status: MaintenanceStatus;
  starts_at: string;
  expected_end_at: string;
  announce_hours_before: number;
  contact_text: string | null;
  internal_note: string | null;
  started_at: string | null;
  ended_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  created_by_name: string | null;
}

/** Janelas de manutenção (a ativa e as agendadas primeiro, depois o histórico). Só super administrador (a RPC confere). */
export async function listMaintenanceWindows(limit = 50): Promise<MaintenanceWindowRow[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("list_maintenance_windows" as never, { p_limit: limit } as never);
  if (error || !Array.isArray(data)) return [];
  return data as unknown as MaintenanceWindowRow[];
}
