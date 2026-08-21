import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentCompany } from "@/lib/companies/queries";
import { CreateCompanyForm } from "@/components/app/create-company-form";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Configurar empresa",
};

export default async function OnboardingPage() {
  // Se o usuário já tem empresa, não faz sentido mostrar onboarding de novo.
  const current = await getCurrentCompany();
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
