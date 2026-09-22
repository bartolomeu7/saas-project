import type { Database } from "@/types/supabase";

export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];

export interface Appointment {
  id: string;
  company_id: string;
  customer_id: string | null;
  service_id: string;
  professional_id: string | null;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  price: number;
  status: AppointmentStatus;
  notes: string | null;
  cancellation_reason: string | null;
  sale_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer_name?: string | null;
  service_name?: string | null;
  professional_name?: string | null;
  professional_color?: string | null;
}

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};
