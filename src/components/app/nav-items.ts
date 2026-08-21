export interface NavItem {
  label: string;
  href: string;
  enabled: boolean;
}

/**
 * Menu principal da área autenticada. Apenas Dashboard e Clientes estão
 * funcionais nesta etapa — os demais aparecem desabilitados ("Em breve")
 * para deixar claro o roadmap sem prometer funcionalidade que não existe.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/app", enabled: true },
  { label: "Clientes", href: "/app/clientes", enabled: true },
  { label: "Produtos", href: "/app/produtos", enabled: false },
  { label: "Serviços", href: "/app/servicos", enabled: false },
  { label: "Vendas", href: "/app/vendas", enabled: false },
  { label: "Estoque", href: "/app/estoque", enabled: false },
  { label: "Financeiro", href: "/app/financeiro", enabled: false },
  { label: "Relatórios", href: "/app/relatorios", enabled: false },
  { label: "Configurações", href: "/app/configuracoes", enabled: false },
];
