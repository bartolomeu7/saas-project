import "server-only";

import { listCustomers } from "@/lib/customers/queries";
import { listProducts } from "@/lib/products/queries";
import { listServices } from "@/lib/services/queries";
import type { QuoteFormCatalogItem, QuoteFormCustomer } from "@/components/app/quote-form";

/** Listas para os seletores do formulário de orçamento: só cadastros ativos da empresa atual (até 1000 de cada). */
export async function loadQuoteFormOptions(companyId: string): Promise<{
  customers: QuoteFormCustomer[];
  products: QuoteFormCatalogItem[];
  services: QuoteFormCatalogItem[];
}> {
  const [customers, products, services] = await Promise.all([
    listCustomers({ companyId, status: "active", page: 1, pageSize: 1000 }),
    listProducts({ companyId, status: "active", page: 1, pageSize: 1000, sortBy: "name" }),
    listServices({ companyId, status: "active", page: 1, pageSize: 1000, sortBy: "name" }),
  ]);
  return {
    customers: customers.customers.map((customer) => ({ id: customer.id, name: customer.name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    products: products.products.map((product) => ({ id: product.id, name: product.name, price: Number(product.sale_price) || 0, unit: product.unit })),
    services: services.services.map((service) => ({ id: service.id, name: service.name, price: Number(service.sale_price) || 0, unit: "serv" })),
  };
}
