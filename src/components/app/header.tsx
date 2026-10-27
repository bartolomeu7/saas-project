"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CommandMenu } from "@/components/app/command-menu";
import { NAV_GROUPS } from "@/components/app/nav-items";
import { NotificationButton } from "@/components/app/notification-button";
import { buildAppBreadcrumbs } from "@/components/app/route-labels";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BUSINESS_TYPE_LABELS, type Company } from "@/types/company";

const NAV_MODULES = NAV_GROUPS.flatMap((group) =>
  group.items.filter((item) => item.enabled).map(({ label, href }) => ({ label, href })),
);

/**
 * Header da área da empresa: gatilho da sidebar, identidade da empresa, breadcrumb da rota atual (md+; mesmo padrão
 * do header do admin) e as ações (busca rápida e notificações).
 */
export function Header({ company }: { company: Company }) {
  const pathname = usePathname() ?? "/app";
  const crumbs = buildAppBreadcrumbs(pathname, NAV_MODULES);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger
            className="-ml-1 text-muted-foreground hover:text-foreground"
            aria-label="Abrir ou recolher o menu"
          />
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {company.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {BUSINESS_TYPE_LABELS[company.business_type]}
            </p>
          </div>
          {crumbs.length > 0 && (
            <>
              <Separator orientation="vertical" className="hidden h-6 md:block" />
              <Breadcrumb className="hidden min-w-0 md:block" aria-label="Localização na área da empresa">
                <BreadcrumbList className="flex-nowrap">
                  {crumbs.map((crumb, index) => (
                    <Fragment key={`${index}-${crumb.label}`}>
                      {index > 0 && <BreadcrumbSeparator />}
                      <BreadcrumbItem className="min-w-0">
                        {crumb.href ? (
                          <BreadcrumbLink asChild>
                            <Link href={crumb.href} className="truncate">
                              {crumb.label}
                            </Link>
                          </BreadcrumbLink>
                        ) : index === crumbs.length - 1 ? (
                          <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                        ) : (
                          <span className="truncate">{crumb.label}</span>
                        )}
                      </BreadcrumbItem>
                    </Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <CommandMenu businessType={company.business_type} />
          <NotificationButton />
        </div>
      </div>
    </header>
  );
}
