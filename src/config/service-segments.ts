/**
 * Dicas de UI do módulo Serviços por segmento (company.business_type).
 *
 * Mesmo espírito de src/config/product-segments.ts: deliberadamente
 * pequeno e escopado só a este módulo, não um "motor de segmento"
 * genérico do app inteiro. Só cobre os segmentos onde serviços são
 * parte central do negócio — os demais usam DEFAULT_HINTS.
 */
import type { BusinessType } from "@/types/company";

export interface ServiceSegmentHints {
  /** Rótulo do módulo em telas/menus (ex: "Serviços"). */
  servicesLabel: string;
  /** Categorias sugeridas no primeiro acesso — nunca obrigatórias. */
  suggestedCategories: string[];
}

const DEFAULT_HINTS: ServiceSegmentHints = {
  servicesLabel: "Serviços",
  suggestedCategories: [],
};

const SERVICE_SEGMENT_HINTS: Partial<Record<BusinessType, ServiceSegmentHints>> = {
  car_wash: {
    servicesLabel: "Serviços",
    suggestedCategories: ["Lavagem", "Enceramento", "Higienização interna", "Polimento"],
  },
  automotive_detailing: {
    servicesLabel: "Serviços",
    suggestedCategories: ["Polimento", "Vitrificação", "Higienização", "Proteção de pintura"],
  },
  workshop: {
    servicesLabel: "Serviços",
    suggestedCategories: ["Revisão", "Troca de óleo", "Alinhamento e balanceamento", "Diagnóstico"],
  },
  beauty_salon: {
    servicesLabel: "Serviços",
    suggestedCategories: ["Corte", "Coloração", "Manicure", "Estética facial"],
  },
  service_provider: {
    servicesLabel: "Serviços",
    suggestedCategories: ["Consultoria", "Manutenção", "Instalação", "Suporte técnico"],
  },
};

export function getServiceSegmentHints(businessType: BusinessType): ServiceSegmentHints {
  return SERVICE_SEGMENT_HINTS[businessType] ?? DEFAULT_HINTS;
}
