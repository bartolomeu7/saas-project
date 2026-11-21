import { cleanText } from "../validations/common.ts";
import { addDaysIso, computeTotals, daysBetweenIso, isValidIsoDate, parseQuoteItems } from "./rules.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Texto de formulário: sem caracteres de controle/invisíveis, espaços repetidos juntados e sem espaços nas pontas (quebras de linha ficam). */
function field(formData: FormData, name: string): string {
  return cleanText(String(formData.get(name) ?? ""))
    .replace(/[^\S\r\n]{2,}/g, " ")
    .trim();
}

interface QuoteArgs {
  p_customer_id: string | null;
  p_customer_name: string;
  p_customer_document: string;
  p_customer_phone: string;
  p_customer_email: string;
  p_customer_address: string;
  p_title: string;
  p_issued_on: string | null;
  p_valid_until: string | null;
  p_payment_terms: string;
  p_delivery_terms: string;
  p_notes: string;
  p_footer: string;
  p_items: unknown;
  p_discount: number;
}

/** Lê e confere o formulário inteiro (o banco confere tudo de novo). Devolve os argumentos da função ou a mensagem de erro. */
export function readQuoteForm(formData: FormData, today: string): { args: QuoteArgs } | { error: string; field?: string } {
  const customerId = field(formData, "customerId");
  if (customerId && !UUID.test(customerId)) return { error: "Cliente inválido.", field: "customerId" };
  const customerName = field(formData, "customerName");
  if (!customerId) {
    if (customerName.length < 2 || !/\p{L}/u.test(customerName)) return { error: "Informe o nome do cliente (pelo menos 2 letras) ou escolha um cliente cadastrado.", field: "customerName" };
  }
  if (customerName.length > 160) return { error: "O nome do cliente pode ter no máximo 160 caracteres.", field: "customerName" };
  const email = field(formData, "customerEmail");
  if (email && (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { error: "Informe um e-mail válido para o cliente.", field: "customerEmail" };
  const document = field(formData, "customerDocument");
  if (document.length > 32) return { error: "O documento do cliente pode ter no máximo 32 caracteres.", field: "customerDocument" };
  const phone = field(formData, "customerPhone");
  if (phone.length > 32) return { error: "O telefone do cliente pode ter no máximo 32 caracteres.", field: "customerPhone" };
  const address = field(formData, "customerAddress");
  if (address.length > 400) return { error: "O endereço do cliente pode ter no máximo 400 caracteres.", field: "customerAddress" };

  const title = field(formData, "title");
  if (title.length > 120) return { error: "O assunto pode ter no máximo 120 caracteres.", field: "title" };
  const paymentTerms = field(formData, "paymentTerms");
  if (paymentTerms.length > 1000) return { error: "As condições de pagamento podem ter no máximo 1000 caracteres.", field: "paymentTerms" };
  const deliveryTerms = field(formData, "deliveryTerms");
  if (deliveryTerms.length > 500) return { error: "O prazo de entrega/execução pode ter no máximo 500 caracteres.", field: "deliveryTerms" };
  const notes = field(formData, "notes");
  if (notes.length > 2000) return { error: "As observações podem ter no máximo 2000 caracteres.", field: "notes" };
  const footer = field(formData, "footer");
  if (footer.length > 300) return { error: "O rodapé pode ter no máximo 300 caracteres.", field: "footer" };

  const issuedOn = field(formData, "issuedOn");
  const validUntil = field(formData, "validUntil");
  if (issuedOn && !isValidIsoDate(issuedOn)) return { error: "Data de emissão inválida.", field: "issuedOn" };
  if (validUntil && !isValidIsoDate(validUntil)) return { error: "Data de validade inválida.", field: "validUntil" };
  const issued = issuedOn || today;
  if (issued < "2000-01-01" || daysBetweenIso(today, issued) > 365) return { error: "Data de emissão fora do período permitido.", field: "issuedOn" };
  if (validUntil) {
    if (validUntil < issued) return { error: "A validade não pode ser antes da emissão.", field: "validUntil" };
    if (validUntil > addDaysIso(issued, 365)) return { error: "A validade pode ser de no máximo 365 dias.", field: "validUntil" };
  }

  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(formData.get("items") ?? ""));
  } catch {
    return { error: "Adicione pelo menos um item ao orçamento." };
  }
  const items = parseQuoteItems(rawItems);
  if (!items.ok) return { error: items.error };
  const discountText = field(formData, "discount");
  const totals = computeTotals(items.lines, discountText);
  if (!totals.ok) return { error: totals.error, field: "discount" };

  return {
    args: {
      p_customer_id: customerId || null,
      p_customer_name: customerName,
      p_customer_document: document,
      p_customer_phone: phone,
      p_customer_email: email,
      p_customer_address: address,
      p_title: title,
      p_issued_on: issuedOn || null,
      p_valid_until: validUntil || null,
      p_payment_terms: paymentTerms,
      p_delivery_terms: deliveryTerms,
      p_notes: notes,
      p_footer: footer,
      p_items: items.items,
      p_discount: totals.totals.discountCents / 100,
    },
  };
}
