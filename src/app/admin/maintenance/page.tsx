import { PageHeader } from "@/components/app/page-header";
import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import { MaintenanceFormDialog } from "@/components/admin/maintenance-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/admin/queries";
import { listMaintenanceWindows, type MaintenanceStatus, type MaintenanceWindowRow } from "@/lib/admin/maintenance-queries";
import {
  cancelMaintenanceAction,
  endMaintenanceAction,
  extendMaintenanceAction,
  scheduleMaintenanceAction,
  startMaintenanceNowAction,
  startScheduledMaintenanceAction,
  updateMaintenanceAction,
} from "@/lib/admin/maintenance-actions";
import { formatDateTime } from "@/lib/format";
import { formatDurationPt, MAINTENANCE_LEVEL_LABELS, minutesUntil, toSaoPauloInputValue } from "@/lib/maintenance-gate";

export const metadata = { title: "Manutenção" };

// Mostra o estado atual do banco: nunca pode ser estática.
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  scheduled: "Agendada",
  active: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};
const STATUS_VARIANTS = { scheduled: "info", active: "warning", completed: "success", cancelled: "muted" } as const;

function formValues(row: MaintenanceWindowRow) {
  return {
    title: row.title,
    message: row.message,
    level: row.level,
    startsAt: toSaoPauloInputValue(row.starts_at),
    expectedEndAt: toSaoPauloInputValue(row.expected_end_at),
    announceHours: row.announce_hours_before,
    contact: row.contact_text ?? "",
    note: row.internal_note ?? "",
  };
}

/** Sugestão para uma nova manutenção: amanhã às 22:00, uma hora de duração (horário de Brasília). */
function defaultNewValues() {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const day = toSaoPauloInputValue(start).slice(0, 10);
  const end = new Date(Date.parse(`${day}T22:00:00-03:00`) + 60 * 60 * 1000);
  return {
    title: "",
    message: "",
    level: "blocked" as const,
    startsAt: `${day}T22:00`,
    expectedEndAt: toSaoPauloInputValue(end),
    announceHours: 48,
    contact: "",
    note: "",
  };
}

/**
 * Manutenção programada — SUPER_ADMIN ONLY (middleware + requireSuperAdmin() + is_super_admin() em cada função do banco).
 * Agendar, editar, cancelar, iniciar agora (emergência), estender e encerrar. Tudo é auditado.
 * O cliente vê a faixa de aviso no app a partir do “aviso antecipado” e, se o nível for bloqueio total, a tela de manutenção.
 */
export default async function AdminMaintenancePage() {
  await requireSuperAdmin();
  const windows = await listMaintenanceWindows(60);
  const active = windows.find((row) => row.status === "active") ?? null;
  const scheduled = windows.filter((row) => row.status === "scheduled").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const history = windows.filter((row) => row.status === "completed" || row.status === "cancelled");

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Operação"
        title="Manutenção programada"
        description="Avise os clientes, bloqueie o sistema na hora marcada e encerre quando terminar. Visível apenas para super administradores."
        actions={
          <div className="flex flex-wrap gap-2">
            <MaintenanceFormDialog
              triggerLabel="Agendar manutenção"
              title="Agendar manutenção"
              submitLabel="Agendar"
              action={scheduleMaintenanceAction}
              initial={defaultNewValues()}
            />
            {!active && (
              <AdminActionDialog
                triggerLabel="Iniciar agora (emergência)"
                triggerVariant="outline"
                triggerSize="sm"
                title="Iniciar manutenção agora"
                description="Sem agendamento prévio: o aviso/bloqueio vale imediatamente. Com bloqueio total, os clientes perdem o acesso na hora."
                submitLabel="Iniciar agora"
                destructive
                fields={[
                  { type: "text", name: "title", label: "Título", required: true, maxLength: 120, defaultValue: "Manutenção em andamento" },
                  {
                    type: "select",
                    name: "level",
                    label: "Nível",
                    required: true,
                    defaultValue: "blocked",
                    options: (Object.keys(MAINTENANCE_LEVEL_LABELS) as (keyof typeof MAINTENANCE_LEVEL_LABELS)[]).map((value) => ({ value, label: MAINTENANCE_LEVEL_LABELS[value] })),
                  },
                  {
                    type: "textarea",
                    name: "message",
                    label: "Mensagem para o cliente",
                    required: true,
                    maxLength: 1000,
                    defaultValue: "Estamos fazendo uma manutenção no Prime Ges. Seus dados estão seguros. Voltamos já.",
                  },
                  { type: "number", name: "minutes", label: "Duração prevista (minutos)", required: true, min: 5, max: 1440, step: 1, defaultValue: 30 },
                  { type: "text", name: "contact", label: "Contato de suporte (opcional)", maxLength: 200 },
                  { type: "text", name: "confirm", label: "Confirmação (só para bloqueio total)", placeholder: "Digite MANUTENÇÃO", hint: "Obrigatório quando o nível for “Sistema indisponível”." },
                ]}
                action={startMaintenanceNowAction}
              />
            )}
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Em andamento</CardTitle>
          <CardDescription>A manutenção que está valendo agora para os clientes.</CardDescription>
        </CardHeader>
        <CardContent>
          {active ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="warning">{MAINTENANCE_LEVEL_LABELS[active.level]}</Badge>
                <span className="font-medium">{active.title}</span>
              </div>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{active.message}</p>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Iniciada em</dt>
                  <dd className="font-medium">{formatDateTime(active.started_at ?? active.starts_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Previsão de término</dt>
                  <dd className="font-medium">{formatDateTime(active.expected_end_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Situação</dt>
                  <dd className="font-medium">
                    {minutesUntil(active.expected_end_at) > 0
                      ? `faltam cerca de ${formatDurationPt(minutesUntil(active.expected_end_at))}`
                      : "passou do previsto: estenda ou encerre"}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <AdminActionDialog
                  triggerLabel="Estender previsão"
                  title="Estender a previsão de término"
                  description="O cliente passa a ver o novo horário de volta na tela de manutenção."
                  submitLabel="Estender"
                  fields={[
                    {
                      type: "select",
                      name: "minutes",
                      label: "Quanto tempo a mais",
                      required: true,
                      defaultValue: "30",
                      options: [
                        { value: "15", label: "+15 minutos" },
                        { value: "30", label: "+30 minutos" },
                        { value: "60", label: "+1 hora" },
                        { value: "120", label: "+2 horas" },
                      ],
                    },
                  ]}
                  action={extendMaintenanceAction.bind(null, active.id)}
                />
                <AdminActionDialog
                  triggerLabel="Encerrar manutenção"
                  triggerVariant="default"
                  title="Encerrar a manutenção agora?"
                  description="O sistema volta ao normal para todos os clientes. Confirme que o teste pós-atualização passou."
                  submitLabel="Encerrar agora"
                  fields={[]}
                  action={endMaintenanceAction.bind(null, active.id)}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma manutenção em andamento. O sistema está disponível.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agendadas</CardTitle>
          <CardDescription>Entram em vigor sozinhas no horário marcado. O fim é sempre manual (“Encerrar manutenção”).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {scheduled.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma manutenção agendada.</p>}
          {scheduled.map((row) => (
            <div key={row.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">{MAINTENANCE_LEVEL_LABELS[row.level]}</Badge>
                  <span className="font-medium">{row.title}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDateTime(row.starts_at)} até {formatDateTime(row.expected_end_at)} · aviso {row.announce_hours_before} h antes
                </p>
                {row.internal_note && <p className="mt-1 text-xs text-muted-foreground">Nota interna: {row.internal_note}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <MaintenanceFormDialog
                  triggerLabel="Editar"
                  triggerVariant="outline"
                  title="Editar manutenção"
                  submitLabel="Salvar"
                  action={updateMaintenanceAction.bind(null, row.id)}
                  initial={formValues(row)}
                />
                <AdminActionDialog
                  triggerLabel="Iniciar agora"
                  title="Iniciar esta manutenção agora?"
                  description="Vale imediatamente, com a mesma duração prevista a partir de agora."
                  submitLabel="Iniciar agora"
                  destructive={row.level === "blocked"}
                  fields={[]}
                  action={startScheduledMaintenanceAction.bind(null, row.id)}
                />
                <AdminActionDialog
                  triggerLabel="Cancelar"
                  title="Cancelar esta manutenção?"
                  description="O aviso some do app dos clientes."
                  submitLabel="Cancelar manutenção"
                  destructive
                  fields={[{ type: "text", name: "reason", label: "Motivo (opcional)", maxLength: 300 }]}
                  action={cancelMaintenanceAction.bind(null, row.id)}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
          <CardDescription>Duração real × prevista ajuda a prometer prazos melhores.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não há manutenções concluídas.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[720px] text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Manutenção</TableHead>
                    <TableHead>Nível</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Duração real</TableHead>
                    <TableHead>Prevista</TableHead>
                    <TableHead>Por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((row) => {
                    const startedAt = row.started_at ?? row.starts_at;
                    const real = row.ended_at ? Math.round((Date.parse(row.ended_at) - Date.parse(startedAt)) / 60000) : null;
                    const planned = Math.round((Date.parse(row.expected_end_at) - Date.parse(row.starts_at)) / 60000);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.title}
                          {row.cancel_reason && <span className="block text-xs font-normal text-muted-foreground">{row.cancel_reason}</span>}
                        </TableCell>
                        <TableCell>{MAINTENANCE_LEVEL_LABELS[row.level]}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                        </TableCell>
                        <TableCell>{formatDateTime(startedAt)}</TableCell>
                        <TableCell>{real === null ? "—" : formatDurationPt(real)}</TableCell>
                        <TableCell>{formatDurationPt(planned)}</TableCell>
                        <TableCell>{row.created_by_name ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
