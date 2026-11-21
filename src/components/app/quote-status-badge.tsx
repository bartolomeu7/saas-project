import { Badge, type BadgeProps } from "@/components/ui/badge";
import { QUOTE_STATUS_LABELS, type QuoteDisplayStatus } from "@/lib/quotes/rules";

const VARIANT: Record<QuoteDisplayStatus, BadgeProps["variant"]> = {
  draft: "muted",
  sent: "info",
  approved: "success",
  rejected: "danger",
  expired: "warning",
  converted: "success",
};

export function QuoteStatusBadge({ status }: { status: QuoteDisplayStatus }) {
  return <Badge variant={VARIANT[status]}>{QUOTE_STATUS_LABELS[status]}</Badge>;
}
