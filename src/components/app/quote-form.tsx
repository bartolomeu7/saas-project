"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import type { ActionResult } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { SubmitButton } from "@/components/shared/auth/submit-button";
import { FormMessage } from "@/components/shared/auth/form-message";
import { useKeepInputOnError } from "@/hooks/use-keep-input-on-error";
import { MAX_QUOTE_ITEMS, computeTotals, formatCents, normalizeDecimal, parseQuoteItems, type QuoteItemType } from "@/lib/quotes/rules";

const initialState: ActionResult = {};

export interface QuoteFormCustomer {
  id: string;
  name: string;
}
export interface QuoteFormCatalogItem {
  id: string;
  name: string;
  price: number;
  unit: string;
}

export interface QuoteFormValues {
  customerId: string;
  customerName: string;
  customerDocument: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  title: string;
  issuedOn: string;
  validUntil: string;
  paymentTerms: string;
  deliveryTerms: string;
  notes: string;
  footer: string;
  discount: string;
  items: DraftItem[];
}

export interface DraftItem {
  type: QuoteItemType;
  refId: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  discount: string;
}

const TYPE_LABELS: Record<QuoteItemType, string> = { product: "Produto", service: "Serviço", custom: "Item livre" };

const emptyItem = (): DraftItem => ({ type: "custom", refId: "", description: "", unit: "un", quantity: "1", unitPrice: "", discount: "" });

const priceText = (value: number) => (Number.isFinite(value) ? String(value) : "");

/** Formulário de criar/editar orçamento (rascunho). O total mostrado aqui é só uma prévia: o banco recalcula tudo ao salvar. */
export function QuoteForm({
  action,
  values,
  customers,
  products,
  services,
  submitLabel,
  pendingLabel,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  values: QuoteFormValues;
  customers: QuoteFormCustomer[];
  products: QuoteFormCatalogItem[];
  services: QuoteFormCatalogItem[];
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction] = useFormState(action, initialState);
  const keepInput = useKeepInputOnError(state);
  const [customerId, setCustomerId] = useState(values.customerId);
  const [discount, setDiscount] = useState(values.discount);
  const [items, setItems] = useState<DraftItem[]>(values.items.length ? values.items : [emptyItem()]);

  const payload = JSON.stringify(
    items.map((item) => ({
      item_type: item.type,
      product_id: item.type === "product" ? item.refId : null,
      service_id: item.type === "service" ? item.refId : null,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount_amount: item.discount,
    }))
  );

  const preview = useMemo(() => {
    const parsed = parseQuoteItems(JSON.parse(payload));
    if (!parsed.ok) return { error: parsed.error };
    const totals = computeTotals(parsed.lines, discount);
    return totals.ok ? { totals: totals.totals } : { error: totals.error };
  }, [payload, discount]);

  function patch(index: number, change: Partial<DraftItem>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...change } : item)));
  }

  function changeType(index: number, type: QuoteItemType) {
    patch(index, { type, refId: "", ...(type === "custom" ? {} : { description: "", unitPrice: "" }), unit: type === "service" ? "serv" : "un" });
  }

  function pick(index: number, type: QuoteItemType, refId: string) {
    const source = (type === "product" ? products : services).find((entry) => entry.id === refId);
    if (!source) return patch(index, { refId: "", description: "", unitPrice: "" });
    patch(index, { refId, description: source.name, unit: source.unit, unitPrice: priceText(source.price) });
  }

  const field = "flex flex-col gap-2";
  const hasCustomer = customerId !== "";

  return (
    <form action={formAction} onReset={keepInput} className="flex flex-col gap-6">
      <FormMessage state={state} />
      <input type="hidden" name="items" value={payload} />

      <section className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Cliente</h2>
        <div className={`${field} sm:col-span-2`}>
          <Label htmlFor="customerId">Cliente cadastrado</Label>
          <NativeSelect id="customerId" name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">Outro cliente (digitar os dados)</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </NativeSelect>
          {hasCustomer && <p className="text-xs text-muted-foreground">Os dados do cadastro (nome, documento, contato e endereço) são copiados para o orçamento na hora de salvar.</p>}
        </div>
        {!hasCustomer && (
          <>
            <div className={field}>
              <Label htmlFor="customerName">Nome do cliente *</Label>
              <Input id="customerName" name="customerName" maxLength={160} defaultValue={values.customerName} autoComplete="off" />
            </div>
            <div className={field}>
              <Label htmlFor="customerDocument">CPF/CNPJ</Label>
              <Input id="customerDocument" name="customerDocument" maxLength={32} defaultValue={values.customerDocument} autoComplete="off" />
            </div>
            <div className={field}>
              <Label htmlFor="customerPhone">Telefone / WhatsApp</Label>
              <Input id="customerPhone" name="customerPhone" maxLength={32} defaultValue={values.customerPhone} autoComplete="off" />
            </div>
            <div className={field}>
              <Label htmlFor="customerEmail">E-mail</Label>
              <Input id="customerEmail" name="customerEmail" type="email" maxLength={160} defaultValue={values.customerEmail} autoComplete="off" />
            </div>
            <div className={`${field} sm:col-span-2`}>
              <Label htmlFor="customerAddress">Endereço</Label>
              <Input id="customerAddress" name="customerAddress" maxLength={400} defaultValue={values.customerAddress} autoComplete="off" />
            </div>
          </>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <h2 className="font-semibold sm:col-span-3">Orçamento</h2>
        <div className={`${field} sm:col-span-3`}>
          <Label htmlFor="title">Assunto</Label>
          <Input id="title" name="title" maxLength={120} placeholder="Ex.: Reforma da cozinha" defaultValue={values.title} />
        </div>
        <div className={field}>
          <Label htmlFor="issuedOn">Data de emissão</Label>
          <Input id="issuedOn" name="issuedOn" type="date" defaultValue={values.issuedOn} />
        </div>
        <div className={field}>
          <Label htmlFor="validUntil">Válido até</Label>
          <Input id="validUntil" name="validUntil" type="date" defaultValue={values.validUntil} />
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <div>
            <h2 className="font-semibold">Itens</h2>
            <p className="text-xs text-muted-foreground">Escolha um produto/serviço do cadastro ou escreva um item livre. O preço pode ser ajustado só neste orçamento.</p>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={items.length >= MAX_QUOTE_ITEMS} onClick={() => setItems((current) => [...current, emptyItem()])}>
            <Plus aria-hidden="true" /> Adicionar item
          </Button>
        </div>
        <div className="divide-y">
          {items.map((item, index) => {
            const catalog = item.type === "product" ? products : item.type === "service" ? services : null;
            const line = preview.totals?.lines[index];
            return (
              <div key={index} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-12 md:items-end">
                <div className={`${field} md:col-span-2`}>
                  <Label htmlFor={`type-${index}`}>Tipo</Label>
                  <NativeSelect id={`type-${index}`} value={item.type} onChange={(event) => changeType(index, event.target.value as QuoteItemType)}>
                    {(Object.keys(TYPE_LABELS) as QuoteItemType[]).map((type) => (
                      <option key={type} value={type}>
                        {TYPE_LABELS[type]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                {catalog && (
                  <div className={`${field} md:col-span-4`}>
                    <Label htmlFor={`ref-${index}`}>{item.type === "product" ? "Produto" : "Serviço"}</Label>
                    <NativeSelect id={`ref-${index}`} value={item.refId} onChange={(event) => pick(index, item.type, event.target.value)}>
                      <option value="">Selecione...</option>
                      {catalog.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                )}
                <div className={`${field} ${catalog ? "md:col-span-6" : "md:col-span-10"}`}>
                  <Label htmlFor={`desc-${index}`}>Descrição</Label>
                  <Input id={`desc-${index}`} maxLength={300} value={item.description} onChange={(event) => patch(index, { description: event.target.value })} placeholder="O que está sendo orçado" />
                </div>
                <div className={`${field} md:col-span-2`}>
                  <Label htmlFor={`qty-${index}`}>Quantidade</Label>
                  <Input id={`qty-${index}`} inputMode="decimal" value={item.quantity} onChange={(event) => patch(index, { quantity: event.target.value })} />
                </div>
                <div className={`${field} md:col-span-1`}>
                  <Label htmlFor={`unit-${index}`}>Unid.</Label>
                  <Input id={`unit-${index}`} maxLength={12} value={item.unit} onChange={(event) => patch(index, { unit: event.target.value })} />
                </div>
                <div className={`${field} md:col-span-2`}>
                  <Label htmlFor={`price-${index}`}>Preço unitário (R$)</Label>
                  <Input id={`price-${index}`} inputMode="decimal" value={item.unitPrice} onChange={(event) => patch(index, { unitPrice: event.target.value })} placeholder="0,00" />
                </div>
                <div className={`${field} md:col-span-2`}>
                  <Label htmlFor={`disc-${index}`}>Desconto (R$)</Label>
                  <Input id={`disc-${index}`} inputMode="decimal" value={item.discount} onChange={(event) => patch(index, { discount: event.target.value })} placeholder="0,00" />
                </div>
                <div className="flex items-center justify-between gap-2 md:col-span-5">
                  <div className="min-w-28 rounded-md border border-dashed p-2 text-right text-sm" aria-label={`Total do item ${index + 1}`}>
                    {line ? formatCents(line.totalCents) : "—"}
                  </div>
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" aria-label={`Remover item ${index + 1}`} onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-3 border-t bg-muted/20 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className={`${field} sm:w-56`}>
            <Label htmlFor="discount">Desconto geral (R$)</Label>
            <Input id="discount" name="discount" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} placeholder="0,00" />
            {discount.trim() !== "" && normalizeDecimal(discount, 2) === null && <p className="text-xs text-destructive">Use só números, com até 2 casas (ex.: 10,50).</p>}
          </div>
          <div className="text-right">
            {preview.totals ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Subtotal {formatCents(preview.totals.subtotalCents)}
                  {preview.totals.discountCents > 0 ? ` − desconto ${formatCents(preview.totals.discountCents)}` : ""}
                </p>
                <p className="text-2xl font-semibold" aria-live="polite">
                  {formatCents(preview.totals.totalCents)}
                </p>
              </>
            ) : (
              <p className="max-w-xs text-xs text-muted-foreground" role="status">
                {preview.error}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Condições</h2>
        <div className={field}>
          <Label htmlFor="paymentTerms">Condições de pagamento</Label>
          <Textarea id="paymentTerms" name="paymentTerms" rows={3} maxLength={1000} defaultValue={values.paymentTerms} />
        </div>
        <div className={field}>
          <Label htmlFor="deliveryTerms">Prazo de entrega / execução</Label>
          <Input id="deliveryTerms" name="deliveryTerms" maxLength={500} defaultValue={values.deliveryTerms} placeholder="Ex.: 10 dias úteis após a aprovação" />
        </div>
        <div className={field}>
          <Label htmlFor="notes">Observações</Label>
          <Textarea id="notes" name="notes" rows={3} maxLength={2000} defaultValue={values.notes} />
        </div>
        <div className={field}>
          <Label htmlFor="footer">Rodapé do PDF</Label>
          <Input id="footer" name="footer" maxLength={300} defaultValue={values.footer} />
        </div>
      </section>

      <SubmitButton state={state} pendingLabel={pendingLabel} className="w-full sm:w-fit">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
