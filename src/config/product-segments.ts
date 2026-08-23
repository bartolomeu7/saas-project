/**
 * Dicas de UI do módulo Produtos por segmento (company.business_type).
 *
 * Não é o "motor de segmento" genérico do app inteiro (menus/dashboard/
 * workflows) — esse projeto ainda não existe no código e construí-lo é
 * um trabalho maior que a Fase 2. Isto aqui é deliberadamente pequeno e
 * escopado só ao módulo de Produtos, suficiente para adaptar campos em
 * destaque, terminologia e categorias sugeridas por segmento.
 */
import type { BusinessType } from "@/types/company";

export interface ProductSegmentHints {
  /** Rótulo do módulo em telas/menus (ex: "Produtos de consumo"). */
  productsLabel: string;
  /** Campo em destaque visual no formulário/listagem. */
  emphasize: "barcode" | "unit_stock" | "none";
  /** Rótulo do indicador de estoque baixo no dashboard. */
  lowStockDashboardLabel: string;
  /** Categorias sugeridas no primeiro acesso — nunca obrigatórias. */
  suggestedCategories: string[];
}

const DEFAULT_HINTS: ProductSegmentHints = {
  productsLabel: "Produtos",
  emphasize: "none",
  lowStockDashboardLabel: "Produtos com estoque baixo",
  suggestedCategories: [],
};

const PRODUCT_SEGMENT_HINTS: Partial<Record<BusinessType, ProductSegmentHints>> = {
  grocery: {
    productsLabel: "Produtos",
    emphasize: "barcode",
    lowStockDashboardLabel: "Produtos com estoque baixo",
    suggestedCategories: ["Bebidas", "Alimentos", "Higiene", "Limpeza"],
  },
  bakery: {
    productsLabel: "Produtos",
    emphasize: "unit_stock",
    lowStockDashboardLabel: "Produtos com estoque baixo",
    suggestedCategories: ["Pães", "Bolos", "Salgados", "Bebidas"],
  },
  restaurant: {
    productsLabel: "Produtos",
    emphasize: "none",
    lowStockDashboardLabel: "Produtos com estoque crítico",
    suggestedCategories: ["Bebidas", "Entradas", "Pratos", "Sobremesas"],
  },
  snack_bar: {
    productsLabel: "Produtos",
    emphasize: "none",
    lowStockDashboardLabel: "Produtos com estoque crítico",
    suggestedCategories: ["Bebidas", "Lanches", "Sobremesas"],
  },
  car_wash: {
    productsLabel: "Produtos de consumo",
    emphasize: "unit_stock",
    lowStockDashboardLabel: "Produtos de consumo em estoque baixo",
    suggestedCategories: ["Produtos de lavagem", "Polimento", "Higienização", "Consumíveis"],
  },
  automotive_detailing: {
    productsLabel: "Produtos de consumo",
    emphasize: "unit_stock",
    lowStockDashboardLabel: "Produtos de consumo em estoque baixo",
    suggestedCategories: ["Polimento", "Vitrificação", "Higienização", "Consumíveis"],
  },
  workshop: {
    productsLabel: "Peças e materiais",
    emphasize: "barcode",
    lowStockDashboardLabel: "Peças com estoque baixo",
    suggestedCategories: ["Peças", "Óleo e fluidos", "Filtros", "Materiais"],
  },
  beauty_salon: {
    productsLabel: "Produtos",
    emphasize: "unit_stock",
    lowStockDashboardLabel: "Produtos com estoque baixo",
    suggestedCategories: ["Cabelo", "Unhas", "Estética", "Consumíveis"],
  },
};

export function getProductSegmentHints(businessType: BusinessType): ProductSegmentHints {
  return PRODUCT_SEGMENT_HINTS[businessType] ?? DEFAULT_HINTS;
}
