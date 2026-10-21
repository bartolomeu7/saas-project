/**
 * Núcleo puro da exclusão da própria conta (sem I/O, sem imports do app: testável direto pelo Node).
 * A regra de negócio vive no banco (delete_account_data / account_deletion_preview, migration 20261022000000);
 * aqui ficam a confirmação digitada, a leitura segura da prévia e os textos dos impedimentos.
 */

/** Palavra que a pessoa digita para confirmar. Sem acento de propósito (teclado de qualquer celular). */
export const DELETE_CONFIRM_WORD = "EXCLUIR";

export function isDeletionConfirmed(input: unknown): boolean {
  return typeof input === "string" && input.trim().toUpperCase() === DELETE_CONFIRM_WORD;
}

export type DeletionBlockedReason = "PLATFORM_ADMIN" | "OWNS_TEAM_COMPANY";

export interface DeletionCompany {
  companyId: string;
  name: string;
  role: string;
  otherMembers: number;
  willDelete: boolean;
  blocks: boolean;
  hasPaidPlan: boolean;
  expiresAt: string | null;
}

export interface DeletionPreview {
  blockedReason: DeletionBlockedReason | null;
  email: string | null;
  fullName: string | null;
  companies: DeletionCompany[];
}

export const BLOCKED_MESSAGES: Record<DeletionBlockedReason, string> = {
  PLATFORM_ADMIN:
    "Esta conta é administradora da plataforma e não pode ser excluída por aqui. Peça a outro administrador para remover o acesso administrativo antes.",
  OWNS_TEAM_COMPANY:
    "Você é o único proprietário de uma empresa que ainda tem outras pessoas. Transfira a propriedade para outra pessoa ou remova a equipe antes de excluir a conta, para não apagar o trabalho dos outros por engano.",
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Lê o JSON da RPC account_deletion_preview. Qualquer formato inesperado devolve null (a ação então se recusa a seguir). */
export function parseDeletionPreview(raw: unknown): DeletionPreview | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.found !== true) return null;

  const blocked = r.blocked_reason;
  if (blocked !== null && blocked !== "PLATFORM_ADMIN" && blocked !== "OWNS_TEAM_COMPANY") return null;
  if (!Array.isArray(r.companies)) return null;

  const companies: DeletionCompany[] = [];
  for (const item of r.companies) {
    if (!item || typeof item !== "object") return null;
    const c = item as Record<string, unknown>;
    const companyId = asString(c.company_id);
    if (!companyId) return null;
    companies.push({
      companyId,
      name: asString(c.name) ?? "Empresa",
      role: asString(c.role) ?? "employee",
      otherMembers: typeof c.other_members === "number" ? c.other_members : 0,
      willDelete: c.will_delete === true,
      blocks: c.blocks === true,
      hasPaidPlan: c.has_paid_plan === true,
      expiresAt: asString(c.expires_at),
    });
  }

  return { blockedReason: blocked, email: asString(r.email), fullName: asString(r.full_name), companies };
}

export interface DeletionSummary {
  /** Empresas que serão apagadas por inteiro (a pessoa é o único membro). */
  toDelete: DeletionCompany[];
  /** Empresas em que a pessoa só sai (continuam com os outros). */
  toLeave: DeletionCompany[];
  /** Empresas apagadas que ainda têm plano pago vigente (não há estorno automático). */
  withPaidPlan: DeletionCompany[];
}

export function summarizeDeletion(preview: DeletionPreview): DeletionSummary {
  const toDelete = preview.companies.filter((c) => c.willDelete);
  return {
    toDelete,
    toLeave: preview.companies.filter((c) => !c.willDelete),
    withPaidPlan: toDelete.filter((c) => c.hasPaidPlan),
  };
}

/** Mapeia o erro do banco para uma mensagem segura (nunca devolve o texto cru do Postgres). */
export function mapDeletionError(message: string | undefined): { code: string; error: string } {
  const text = message ?? "";
  if (text.includes("ACCOUNT_DELETE_BLOCKED:PLATFORM_ADMIN")) return { code: "PLATFORM_ADMIN", error: BLOCKED_MESSAGES.PLATFORM_ADMIN };
  if (text.includes("ACCOUNT_DELETE_BLOCKED:OWNS_TEAM_COMPANY")) return { code: "OWNS_TEAM_COMPANY", error: BLOCKED_MESSAGES.OWNS_TEAM_COMPANY };
  if (text.includes("ACCOUNT_NOT_FOUND")) return { code: "ACCOUNT_NOT_FOUND", error: "Esta conta já foi excluída." };
  return { code: "DELETE_FAILED", error: "Não foi possível excluir a conta agora. Nada foi apagado. Tente novamente em instantes." };
}
