/**
 * Tipos de domínio relacionados a produtos e categorias. Espelham as
 * tabelas criadas em supabase/migrations/006_products.sql.
 */

/** Espelha o enum public.product_status (reaproveitado por produtos e categorias). */
export type ProductStatus = "active" | "inactive";

/** Espelha o enum public.product_unit. */
export type ProductUnit = "un" | "kg" | "g" | "l" | "ml" | "m" | "cx" | "pct" | "kit";

export const PRODUCT_UNIT_LABELS: Record<ProductUnit, string> = {
  un: "Unidade",
  kg: "Quilograma",
  g: "Grama",
  l: "Litro",
  ml: "Mililitro",
  m: "Metro",
  cx: "Caixa",
  pct: "Pacote",
  kit: "Kit",
};

/** Espelha a tabela public.product_categories. */
export interface ProductCategory {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}

/** Espelha a tabela public.products. */
export interface Product {
  id: string;
  company_id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  unit: ProductUnit;
  cost_price: number;
  sale_price: number;
  stock_quantity: number;
  minimum_stock: number;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}

/** Produto com o nome da categoria já resolvido, para listagem/detalhe. */
export interface ProductWithCategory extends Product {
  category_name: string | null;
}

/** Nível de estoque calculado — nunca inventado, sempre a partir de stock/minimum reais. */
export type StockLevel = "normal" | "low" | "out";

export function getStockLevel(product: Pick<Product, "stock_quantity" | "minimum_stock">): StockLevel {
  if (product.stock_quantity <= 0) return "out";
  if (product.stock_quantity <= product.minimum_stock) return "low";
  return "normal";
}

export const STOCK_LEVEL_LABELS: Record<StockLevel, string> = {
  normal: "Estoque normal",
  low: "Estoque baixo",
  out: "Sem estoque",
};

/** Campos que o formulário de produto envia. company_id nunca vem do cliente. */
export type ProductFormFields = Pick<
  Product,
  | "name"
  | "category_id"
  | "sku"
  | "barcode"
  | "description"
  | "unit"
  | "cost_price"
  | "sale_price"
  | "stock_quantity"
  | "minimum_stock"
  | "status"
>;

export interface ProductMargin {
  /** null quando sale_price é 0 (percentual não é matematicamente definido). */
  value: number;
  percentage: number | null;
}

/**
 * Margem sobre o preço de venda (não sobre o custo) — calculada sempre
 * em código, nunca armazenada. Ver seção 7 da especificação da Fase 2.
 */
export function calculateMargin(costPrice: number, salePrice: number): ProductMargin {
  const value = salePrice - costPrice;
  const percentage = salePrice > 0 ? (value / salePrice) * 100 : null;
  return { value, percentage };
}
