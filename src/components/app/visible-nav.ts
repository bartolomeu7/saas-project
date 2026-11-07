import { NAV_GROUPS, type NavGroup } from "@/components/app/nav-items";
import { canAccessPath } from "@/lib/permissions/matrix";
import type { CompanyRole } from "@/types/company";

/**
 * Menu visível para o papel: esconde os módulos que o papel não pode usar (Financeiro, Relatórios, Fornecedores,
 * Compras para funcionário). A tela de cada módulo também confere a permissão — esconder o item é só conforto.
 */
export function visibleNavGroups(role: CompanyRole | null | undefined): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccessPath(role, item.href)),
  })).filter((group) => group.items.length > 0);
}
