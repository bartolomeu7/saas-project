import type { CompanyRole } from "@/types/company";

/**
 * MATRIZ ÚNICA de permissões por papel da empresa (dono "owner", gerente "admin", funcionário "employee").
 *
 * Fonte única para menu, páginas e botões. O banco continua sendo a barreira real (RLS/RPCs, migration
 * 20261108000000_permissions_matrix): esta tabela só impede a pessoa de ver/clicar no que o banco vai recusar,
 * e há um teste (tests/unit/permissions-matrix.test.mjs) que falha se as duas pontas discordarem dos itens críticos.
 * Decisões do dono: docs/PERMISSOES_MATRIZ_PROPOSTA_2026-11-07.md.
 */
export type Permission =
  | "finance.view" // Financeiro: lançamentos, contas a pagar/receber
  | "reports.view" // Relatórios (faturamento, lucro, despesas)
  | "suppliers.view" // Fornecedores: ver, cadastrar e editar
  | "purchases.view" // Compras: ver pedidos (criar/receber/cancelar já eram owner/admin)
  | "pricing.edit" // Alterar preço de venda e custo de produtos/serviços já cadastrados
  | "cost.view" // Ver o custo e a margem
  | "stock.adjust" // Ajustar saldo de estoque
  | "cash.open" // Abrir o caixa
  | "cash.close_any" // Fechar o caixa aberto por outra pessoa
  | "cash.manual_movement" // Sangria, suprimento, despesa avulsa
  | "team.manage_staff" // Adicionar/remover/trocar papel de FUNCIONÁRIO
  | "team.manage_admins" // Adicionar/promover/rebaixar/remover ADMIN (e mexer no dono)
  | "hr.view" // RH: ver funcionários, pagamentos, vales e presença (só dono e administrador)
  | "hr.manage"; // RH: cadastrar, marcar presença, lançar vales, fechar e pagar períodos

const MANAGERS: readonly CompanyRole[] = ["owner", "admin"];
const EVERYONE: readonly CompanyRole[] = ["owner", "admin", "employee"];

export const PERMISSION_ROLES: Record<Permission, readonly CompanyRole[]> = {
  "finance.view": MANAGERS,
  "reports.view": MANAGERS,
  "suppliers.view": MANAGERS,
  "purchases.view": MANAGERS,
  "pricing.edit": MANAGERS,
  "cost.view": MANAGERS,
  "stock.adjust": MANAGERS,
  "cash.open": EVERYONE,
  "cash.close_any": MANAGERS,
  "cash.manual_movement": MANAGERS,
  "team.manage_staff": MANAGERS,
  "team.manage_admins": ["owner"],
  "hr.view": MANAGERS,
  "hr.manage": MANAGERS,
};

export function can(role: CompanyRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return PERMISSION_ROLES[permission].includes(role);
}

/** Módulos do menu que exigem uma permissão. Os demais (Dashboard, Vendas, Caixa…) são de qualquer membro. */
export const MODULE_PERMISSIONS: Record<string, Permission> = {
  "/app/financeiro": "finance.view",
  "/app/relatorios": "reports.view",
  "/app/fornecedores": "suppliers.view",
  "/app/compras": "purchases.view",
  "/app/rh": "hr.view",
};

/** Permissão exigida por um caminho (o prefixo mais específico vence); `null` = liberado a qualquer membro. */
export function permissionForPath(pathname: string): Permission | null {
  const match = Object.keys(MODULE_PERMISSIONS)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match === undefined ? null : (MODULE_PERMISSIONS[match] ?? null);
}

export function canAccessPath(role: CompanyRole | null | undefined, pathname: string): boolean {
  const permission = permissionForPath(pathname);
  return permission === null ? !!role : can(role, permission);
}

/** Funcionário só fecha o caixa que ele mesmo abriu; dono/admin fecham qualquer um. */
export function canCloseCashRegister(
  role: CompanyRole | null | undefined,
  openedBy: string | null | undefined,
  userId: string | null | undefined
): boolean {
  if (can(role, "cash.close_any")) return true;
  return !!role && !!openedBy && !!userId && openedBy === userId;
}

/** Quem pode agir sobre um membro da equipe: admin só mexe em funcionário; dono mexe em todos. */
export function canManageMember(
  actorRole: CompanyRole | null | undefined,
  targetRole: CompanyRole
): boolean {
  if (targetRole === "employee") return can(actorRole, "team.manage_staff");
  return can(actorRole, "team.manage_admins");
}
