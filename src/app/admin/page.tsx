import type { Metadata } from "next";
import { getPlatformOverview, listPlatformCompanies } from "@/lib/admin/queries";
import { CompanyStatusForm } from "@/components/app/admin-action-forms";

export const metadata: Metadata = { title: "Administração da plataforma" };

export default async function AdminPage() {
  const [overview, companies] = await Promise.all([getPlatformOverview(), listPlatformCompanies()]);

  if (!overview) {
    return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">Não foi possível carregar a administração da plataforma.</div></main>;
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Plataforma</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Administração e governança</h1>
        <p className="mt-1 text-sm text-muted-foreground">Visão administrativa separada do papel owner/admin de uma empresa.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="prime-kpi-card rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Usuários</p><p className="mt-1 text-xl font-semibold">{overview.total_users}</p></div>
        <div className="prime-kpi-card rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Usuários ativos</p><p className="mt-1 text-xl font-semibold">{overview.active_users}</p></div>
        <div className="prime-kpi-card rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Empresas</p><p className="mt-1 text-xl font-semibold">{overview.total_companies}</p></div>
        <div className="prime-kpi-card rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Assinaturas ativas</p><p className="mt-1 text-xl font-semibold">{overview.active_subscriptions}</p></div>
      </div>
      <section className="overflow-x-auto rounded-xl border bg-card">
        <div className="border-b px-5 py-4"><h2 className="font-semibold">Empresas</h2><p className="text-sm text-muted-foreground">Até 100 empresas mais recentes, com status operacional e assinatura.</p></div>
        <table className="w-full min-w-[980px] text-sm">
          <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Empresa</th><th className="p-3">Tipo</th><th className="p-3">Membros</th><th className="p-3">Status</th><th className="p-3">Assinatura</th><th className="p-3">Validade</th><th className="p-3">Ação</th></tr></thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.company_id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="p-3 font-medium">{company.name}</td>
                <td className="p-3">{company.business_type}</td>
                <td className="p-3">{company.members_count}</td>
                <td className="p-3">{company.status}</td>
                <td className="p-3">{company.subscription_status ?? "—"}</td>
                <td className="p-3">{company.subscription_expires_at ? new Date(company.subscription_expires_at).toLocaleDateString("pt-BR") : "—"}</td>
                <td className="p-3"><CompanyStatusForm company={company} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!companies.length ? <div className="p-8 text-sm text-muted-foreground">Nenhuma empresa encontrada.</div> : null}
      </section>
    </main>
  );
}
