import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  AUDIT_CATEGORY_LABELS,
  COMPANY_STATUS_LABELS,
  PAYMENT_PROVIDER_LABELS,
  PAYMENT_STATUS_LABELS,
  PRESENCE_LABELS,
  USER_ROLE_LABELS,
  USER_STATUS_LABELS,
  type AuditCategory,
  type PresenceState,
} from "@/types/admin";
import type { CompanyStatus } from "@/types/company";
import type { UserRole, UserStatus } from "@/types/profile";

const ROLE_VARIANTS: Record<UserRole, BadgeProps["variant"]> = {
  user: "muted",
  admin: "info",
  super_admin: "warning",
};

const USER_STATUS_VARIANTS: Record<UserStatus, BadgeProps["variant"]> = {
  active: "success",
  inactive: "muted",
  suspended: "danger",
};

const COMPANY_STATUS_VARIANTS: Record<CompanyStatus, BadgeProps["variant"]> = {
  active: "success",
  inactive: "muted",
};

const PRESENCE_VARIANTS: Record<PresenceState, BadgeProps["variant"]> = {
  online: "success",
  recent: "warning",
  offline: "muted",
};

const PAYMENT_STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  paid: "success",
  pending: "warning",
  expired: "muted",
  cancelled: "muted",
  failed: "danger",
  refunded: "info",
};

const AUDIT_VARIANTS: Record<AuditCategory, BadgeProps["variant"]> = {
  USER_MANAGEMENT: "info",
  ROLE_CHANGE: "warning",
  STATUS_CHANGE: "warning",
  ACCESS_EXTENSION: "success",
  PLAN_CHANGE: "info",
  SUBSCRIPTION_CHANGE: "info",
  MANUAL_PAYMENT: "success",
  PAYMENT: "success",
  ADMIN_ACTION: "muted",
  SYSTEM: "muted",
  WEBHOOK: "info",
  INTEGRATION: "info",
};

export function UserRoleBadge({ role }: { role: UserRole }) {
  return <Badge variant={ROLE_VARIANTS[role]}>{USER_ROLE_LABELS[role]}</Badge>;
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return <Badge variant={USER_STATUS_VARIANTS[status]}>{USER_STATUS_LABELS[status]}</Badge>;
}

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  return <Badge variant={COMPANY_STATUS_VARIANTS[status]}>{COMPANY_STATUS_LABELS[status]}</Badge>;
}

export function PresenceBadge({ presence }: { presence: PresenceState }) {
  return <Badge variant={PRESENCE_VARIANTS[presence]}>{PRESENCE_LABELS[presence]}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={PAYMENT_STATUS_VARIANTS[status] ?? "muted"}>{PAYMENT_STATUS_LABELS[status] ?? status}</Badge>
  );
}

export function PaymentProviderBadge({ provider }: { provider: string }) {
  return <Badge variant={provider === "manual" ? "warning" : "info"}>{PAYMENT_PROVIDER_LABELS[provider] ?? provider}</Badge>;
}

export function AuditCategoryBadge({ category }: { category: AuditCategory }) {
  return <Badge variant={AUDIT_VARIANTS[category] ?? "muted"}>{AUDIT_CATEGORY_LABELS[category] ?? category}</Badge>;
}
