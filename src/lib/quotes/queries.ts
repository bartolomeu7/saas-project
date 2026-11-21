import "server-only";

import { createSessionClient } from "@/lib/supabase/server";
import { buildSearchOr } from "@/lib/search/pattern";
import { displayStatus, type QuoteDisplayStatus } from "@/lib/quotes/rules";
import { todayDateSaoPaulo } from "@/lib/timezone";
import type { Quote, QuoteEvent, QuoteItem } from "@/types/quote";

// As tabelas novas ainda não constam nos tipos gerados do banco: a consulta passa por um tipo solto (RLS continua valendo).
const db = async () => (await createSessionClient()) as any;

export const QUOTE_LIST_LIMIT = 100;

export interface QuoteListRow extends Quote {
  display_status: QuoteDisplayStatus;
}

export interface QuoteStats {
  total: number;
  draft: number;
  open: number; // enviados ainda em dia
  approved: number;
  expired: number;
  approvedAmount: number;
  openAmount: number;
}

function withDisplay(rows: Quote[]): QuoteListRow[] {
  const today = todayDateSaoPaulo();
  return rows.map((row) => ({ ...row, display_status: displayStatus(row.status, row.valid_until, today) }));
}

/** Lista os orçamentos da empresa (mais recentes primeiro), com busca por número/cliente/assunto e filtro de situação. */
export async function listQuotes(companyId: string, opts: { search?: string; status?: QuoteDisplayStatus | "" } = {}): Promise<{ rows: QuoteListRow[]; total: number }> {
  const supabase = await db();
  const today = todayDateSaoPaulo();
  let query = supabase.from("quotes").select("*", { count: "exact" }).eq("company_id", companyId);

  const status = opts.status ?? "";
  if (status === "expired") query = query.eq("status", "sent").lt("valid_until", today);
  else if (status === "sent") query = query.eq("status", "sent").gte("valid_until", today);
  else if (status) query = query.eq("status", status);

  const filter = buildSearchOr(opts.search ?? "", ["number", "customer_name", "title"], ["customer_document", "customer_phone"]);
  if (filter) query = query.or(filter);

  const { data, error, count } = await query.order("created_at", { ascending: false }).limit(QUOTE_LIST_LIMIT);
  if (error) return { rows: [], total: 0 };
  return { rows: withDisplay((data ?? []) as Quote[]), total: count ?? 0 };
}

/** Números dos cartões da lista (sem trazer a tabela inteira para o servidor de páginas). */
export async function getQuoteStats(companyId: string): Promise<QuoteStats> {
  const supabase = await db();
  const { data } = await supabase.from("quotes").select("status, valid_until, total_amount").eq("company_id", companyId).limit(5000);
  const today = todayDateSaoPaulo();
  const stats: QuoteStats = { total: 0, draft: 0, open: 0, approved: 0, expired: 0, approvedAmount: 0, openAmount: 0 };
  for (const row of (data ?? []) as Array<Pick<Quote, "status" | "valid_until" | "total_amount">>) {
    stats.total += 1;
    const shown = displayStatus(row.status, row.valid_until, today);
    const amount = Number(row.total_amount) || 0;
    if (shown === "draft") stats.draft += 1;
    else if (shown === "sent") {
      stats.open += 1;
      stats.openAmount += amount;
    } else if (shown === "approved") {
      stats.approved += 1;
      stats.approvedAmount += amount;
    } else if (shown === "expired") stats.expired += 1;
  }
  return stats;
}

export interface QuoteDetail {
  quote: QuoteListRow;
  items: QuoteItem[];
  events: QuoteEvent[];
}

export async function getQuoteDetail(companyId: string, id: string): Promise<QuoteDetail | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const supabase = await db();
  const { data: quote } = await supabase.from("quotes").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (!quote) return null;
  const [{ data: items }, { data: events }] = await Promise.all([
    supabase.from("quote_items").select("*").eq("quote_id", id).order("position", { ascending: true }),
    supabase.from("quote_events").select("*").eq("quote_id", id).order("created_at", { ascending: true }),
  ]);
  return {
    quote: withDisplay([quote as Quote])[0]!,
    items: (items ?? []) as QuoteItem[],
    events: (events ?? []) as QuoteEvent[],
  };
}
