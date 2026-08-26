/**
 * Dicas de UI do módulo Vendas por segmento (company.business_type).
 *
 * Mesmo espírito de product-segments.ts/service-segments.ts: pequeno e
 * escopado só a este módulo. Não cria páginas novas — só adapta rótulo
 * do botão principal e qual busca (produto/serviço) fica em destaque na
 * tela de nova venda. No banco continua sendo sempre "sale".
 */
import type { BusinessType } from "@/types/company";

export interface SaleSegmentHints {
  /** Rótulo do botão/ação principal (ex: "Nova venda", "Novo atendimento"). */
  newSaleLabel: string;
  /** Qual busca (produto/serviço) aparece primeiro/em destaque na tela de nova venda. */
  priority: "products" | "services" | "both";
}

const DEFAULT_HINTS: SaleSegmentHints = {
  newSaleLabel: "Nova venda",
  priority: "products",
};

const SALE_SEGMENT_HINTS: Partial<Record<BusinessType, SaleSegmentHints>> = {
  grocery: { newSaleLabel: "Nova venda", priority: "products" },
  bakery: { newSaleLabel: "Nova venda", priority: "products" },
  restaurant: { newSaleLabel: "Nova venda", priority: "products" },
  snack_bar: { newSaleLabel: "Nova venda", priority: "products" },
  car_wash: { newSaleLabel: "Novo atendimento", priority: "services" },
  automotive_detailing: { newSaleLabel: "Novo atendimento", priority: "services" },
  beauty_salon: { newSaleLabel: "Novo atendimento", priority: "services" },
  workshop: { newSaleLabel: "Nova venda", priority: "both" },
  service_provider: { newSaleLabel: "Novo atendimento", priority: "services" },
};

export function getSaleSegmentHints(businessType: BusinessType): SaleSegmentHints {
  return SALE_SEGMENT_HINTS[businessType] ?? DEFAULT_HINTS;
}
