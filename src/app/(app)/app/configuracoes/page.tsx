import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCompanySettings, getUserPreferences, listRecentAuditLogs } from "@/lib/settings/queries";
import { CompanySettingsForm, UserPreferencesForm } from "@/components/app/settings-forms";

export const metadata: Metadata = { title: "Configurações" };

function formatAction(action: string) {
  return action.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function SettingsPage() {
  const current = (await getCurrentCompany())!;
  const [settings, rawPreferences, auditLogs] = await Promise.all([
    getCompanySettings(current.company.id),
    getUserPreferences(),
    listRecentAuditLogs(current.company.id),
  ]);

  const preferences = rawPreferences ?? {
    user_id: "",
    theme: "system" as const,
    density: "comfortable" as const,
    locale: "pt-BR",
    timezone: settings.timezone,
    notifications_enabled: true,
    email_notifications_enabled: true,
    created_at: "",
    updated_at: "",
  };

  const canManage = current.role === "owner" || current.role === "admin";

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Empresa</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Configurações e governança</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Preferências da empresa, preferências pessoais, papéis de acesso e trilha recente de alterações.
          </p>
        </div>
        <Link href="/app/equipe" className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted">
          Gerenciar equipe
        </Link>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Empresa</h2>
        <p className="mt-1 text-sm text-muted-foreground">Padrões operacionais compartilhados por toda a empresa.</p>
        <div className="mt-5"><CompanySettingsForm settings={settings} canManage={canManage} /></div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Minhas preferências</h2>
        <p className="mt-1 text-sm text-muted-foreground">Tema, densidade, fuso e notificações do seu usuário.</p>
        <div className="mt-5"><UserPreferencesForm preferences={preferences} /></div>
      </section>

      <section className="grid gap-3 rounded-xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">Papéis e acesso</h2>
          <p className="mt-1 text-sm text-muted-foreground">RBAC atual por empresa, mantendo owner/admin/employee separados do papel de plataforma.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-4"><p className="font-medium">Owner</p><p className="mt-1 text-sm text-muted-foreground">Controle administrativo da empresa, equipe e configurações.</p></div>
          <div className="rounded-lg border p-4"><p className="font-medium">Administrador</p><p className="mt-1 text-sm text-muted-foreground">Operação e gestão administrativa dentro da empresa.</p></div>
          <div className="rounded-lg border p-4"><p className="font-medium">Funcionário</p><p className="mt-1 text-sm text-muted-foreground">Acesso aos fluxos operacionais liberados pelo sistema.</p></div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Trilha de auditoria recente</h2>
          <p className="text-sm text-muted-foreground">Últimos eventos registrados para esta empresa.</p>
        </div>
        {auditLogs.length ? (
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Data</th><th className="p-3">Ação</th><th className="p-3">Entidade</th><th className="p-3">ID</th></tr></thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">{new Date(log.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-3 font-medium">{formatAction(log.action)}</td>
                  <td className="p-3">{log.entity_type}</td>
                  <td className="p-3 font-mono text-xs">{log.entity_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="p-8 text-sm text-muted-foreground">Nenhum evento de auditoria encontrado.</div>}
      </section>
    </div>
  );
}
