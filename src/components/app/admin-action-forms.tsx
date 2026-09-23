"use client";

import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/auth/actions";
import { setPlatformCompanyStatusAction } from "@/lib/admin/actions";
import { FormMessage } from "@/components/shared/auth/form-message";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import type { PlatformCompany } from "@/lib/admin/queries";

const initialState: ActionResult = {};

export function CompanyStatusForm({ company }: { company: PlatformCompany }) {
  const [state, formAction] = useFormState(setPlatformCompanyStatusAction, initialState);
  const nextStatus = company.status === "active" ? "inactive" : "active";

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="companyId" value={company.company_id} />
      <input type="hidden" name="status" value={nextStatus} />
      <SubmitButton pendingLabel="Salvando..." variant="outline" className="w-auto">
        {nextStatus === "active" ? "Ativar" : "Inativar"}
      </SubmitButton>
      {state.error || state.success ? <FormMessage state={state} /> : null}
    </form>
  );
}
