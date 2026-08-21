import { Alert } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/auth/actions";

export function FormMessage({ state }: { state: ActionResult }) {
  if (state.error) {
    return <Alert variant="destructive">{state.error}</Alert>;
  }

  if (state.success) {
    return <Alert variant="success">{state.success}</Alert>;
  }

  return null;
}
