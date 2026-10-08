import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  COMPANY_STATUS_LABELS,
  USER_ROLE_LABELS,
  USER_STATUS_LABELS,
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

export function UserRoleBadge({ role }: { role: UserRole }) {
  return <Badge variant={ROLE_VARIANTS[role]}>{USER_ROLE_LABELS[role]}</Badge>;
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return <Badge variant={USER_STATUS_VARIANTS[status]}>{USER_STATUS_LABELS[status]}</Badge>;
}

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  return <Badge variant={COMPANY_STATUS_VARIANTS[status]}>{COMPANY_STATUS_LABELS[status]}</Badge>;
}
