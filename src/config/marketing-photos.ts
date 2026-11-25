/**
 * Fotos da modelo (uma só, gerada por IA, apenas para demonstrar o produto). Roteiro dos pedidos:
 * docs/FOTOS_MODELO_IA.md. Para publicar uma foto, coloque o arquivo em public/marketing/ e preencha o espaço aqui.
 * Espaço vazio = a página mostra a tela do sistema no lugar, sem caixa vazia.
 */
export type PhotoSlot = "balcao" | "tablet" | "pagamento" | "fechamento" | "sorriso";

export interface MarketingPhotoData {
  /** Caminho a partir de public/, ex.: "/marketing/balcao.webp". */
  src: string;
  width: number;
  height: number;
  alt: string;
}

export const MARKETING_PHOTOS: Partial<Record<PhotoSlot, MarketingPhotoData>> = {};
