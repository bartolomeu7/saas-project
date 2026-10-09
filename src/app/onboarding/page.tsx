import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ACCOUNT_BLOCKED_PATH, AccountInactiveError } from "@/lib/auth/account-status";
import { getCurrentCompany } from "@/lib/companies/queries";
import { CreateCompanyForm } from "@/components/app/create-company-form";
import { siteConfig } from "@/config/site";
import { requireLegalConsent } from "@/lib/legal/consent";

export const metadata: Metadata = {
  title: "Configurar empresa",
};

export default async function OnboardingPage() {
  // Sem consentimento legal vigente, o onboarding também exige o aceite antes.
  await requireLegalConsent();

  // Se o usuário já tem empresa, não faz sentido mostrar onboarding de novo.
  let current;
  try {
    current = await getCurrentCompany();
  } catch (error) {
    // Conta inativa/suspensa não conclui onboarding (o middleware já barra; esta é a 2ª camada).
    if (error instanceof AccountInactiveError) {
      redirect(ACCOUNT_BLOCKED_PATH);
    }
    throw error;
  }
  if (current) {
    redirect("/app");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-1 text-center">
          <span className="text-lg font-semibold tracking-tight">
            {siteConfig.name}
          </span>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">
              Vamos configurar sua empresa
            </h1>
            <p className="text-sm text-muted-foreground">
              Leva menos de um minuto. Você poderá ajustar isso depois.
            </p>
          </div>

          <CreateCompanyForm />
        </div>
      </div>
    </main>
  );
}
