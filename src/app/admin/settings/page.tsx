import { PageHeader } from "@/components/app/page-header";
import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setPlatformSettingAction } from "@/lib/admin/actions";
import { getPlatformSettings, requireSuperAdmin } from "@/lib/admin/queries";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Configurações" };

const SETTING_LABELS: Record<string, { label: string; unit: string }> = {
  admin_max_free_days: { label: "Limite de dias gratuitos por operação (admin)", unit: "dias" },
  presence_online_seconds: { label: "Janela de “online agora”", unit: "segundos" },
  presence_recent_minutes: { label: "Janela de “ativo recentemente”", unit: "minutos" },
};

/** Quem pode o quê — espelha as RPCs (a autoridade é o banco, esta tabela é só informativa). */
const CAPABILITIES: { feature: string; admin: boolean }[] = [
  { feature: "Ver painel, usuários, empresas, assinaturas, pagamentos e planos", admin: true },
  { feature: "Suspender/reativar usuários comuns", admin: true },
  { feature: "Conceder dias de acesso (até o limite acima) e liberar 30 dias", admin: true },
  { feature: "Registrar pagamento manual, atribuir plano, reativar assinatura", admin: true },
  { feature: "Editar nome de usuário comum e dados básicos da empresa", admin: true },
  { feature: "Reverificar pagamento na EvoPay e usar Ferramentas", admin: true },
  { feature: "Ver a auditoria completa (admin vê só as próprias ações)", admin: false },
  { feature: "Alterar papéis, gerenciar administradores", admin: false },
  { feature: "Cancelar assinatura, ajustar vencimento, anular pagamento manual", admin: false },
  { feature: "Criar/editar/ativar/desativar planos e ativar/inativar empresas", admin: false },
  { feature: "Alterar estas configurações", admin: false },
];

/**
 * Configurações da plataforma — SUPER_ADMIN ONLY (middleware + requireSuperAdmin() +
 * set_platform_setting() no banco). Só existem configurações com efeito real no
 * código: cada chave é lida pelas RPCs/consultas correspondentes. Faixas e
 * coerência são validadas no banco e toda alteração é auditada.
 */
export default async function AdminSettingsPage() {
  await requireSuperAdmin();
  const settings = await getPlatformSettings();

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Sistema"
        title="Configurações"
        description="Parâmetros da plataforma com efeito real. Visível apenas para super administradores."
      />

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Parâmetros</CardTitle>
          <CardDescription>Cada alteração é validada no banco e registrada na auditoria.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Configuração</TableHead>
              <TableHead className="text-right">Valor atual</TableHead>
              <TableHead className="text-right">Padrão</TableHead>
              <TableHead className="text-right">Faixa</TableHead>
              <TableHead>Última alteração</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {settings.map((setting) => {
              const meta = SETTING_LABELS[setting.key] ?? { label: setting.key, unit: "" };
              return (
                <TableRow key={setting.key}>
                  <TableCell>
                    <div className="flex min-w-[14rem] flex-col">
                      <span className="font-medium text-foreground">{meta.label}</span>
                      <span className="text-xs text-muted-foreground">{setting.description}</span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {setting.value} {meta.unit}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    {setting.default_value}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    {setting.min_value}–{setting.max_value}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {setting.updated_at ? (
                      <span className="flex flex-col text-xs">
                        <span>{formatDateTime(setting.updated_at)}</span>
                        <span>{setting.updated_by_email ?? "—"}</span>
                      </span>
                    ) : (
                      <span className="text-xs">Valor padrão</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <AdminActionDialog
                      triggerLabel="Alterar"
                      triggerSize="xs"
                      title={meta.label}
                      description={setting.description}
                      submitLabel="Salvar"
                      action={setPlatformSettingAction.bind(null, setting.key)}
                      fields={[
                        {
                          type: "number",
                          name: "value",
                          label: `Novo valor (${meta.unit})`,
                          required: true,
                          min: setting.min_value,
                          max: setting.max_value,
                          step: 1,
                          defaultValue: setting.value,
                          hint: `Entre ${setting.min_value} e ${setting.max_value}.`,
                        },
                        { type: "textarea", name: "reason", label: "Motivo (opcional)", maxLength: 500 },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Permissões por papel</CardTitle>
          <CardDescription>Super admin pode tudo; esta tabela mostra o que é liberado também ao admin.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionalidade</TableHead>
                <TableHead className="w-28">Admin</TableHead>
                <TableHead className="w-28">Super admin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CAPABILITIES.map((capability) => (
                <TableRow key={capability.feature}>
                  <TableCell>{capability.feature}</TableCell>
                  <TableCell>
                    <Badge variant={capability.admin ? "success" : "muted"}>{capability.admin ? "Permitido" : "Não"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="success">Permitido</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
