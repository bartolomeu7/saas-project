/** Espelha public.customer_documents, já com o nome de quem enviou resolvido (join com profiles). */
export interface CustomerDocument {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  uploadedByName: string | null;
}
