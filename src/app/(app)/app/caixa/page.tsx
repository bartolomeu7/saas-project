import type { Metadata } from "next";
import { Lock, Unlock } from "lucide-react";
import { getCurrentCompany } from "@/lib/companies/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { can, canCloseCashRegister } from "@/lib/permissions/matrix";
import {
  getCurrentOpenCashRegister,
  getLastClosedCashRegister,
  listCashMovements,
  summarizeCashMovements,
} from "@/lib/cash-register/queries";
import { CashRegisterOpenForm } from "@/components/app/cash-register-open-form";
import { CashRegisterCloseForm } from "@/components/app/cash-register-close-form";
import { CashMovementForm } from "@/components/app/cash-movement-form";
import { CashMovementsTable } from "@/components/app/cash-movements-table";
import { CashRegisterSummaryCards } from "@/components/app/cash-register-summary";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = {
  title: "Caixa",
};

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function CashRegisterPage() {
  const current = (await getCurrentCompany())!;
  // Matriz de permissões (lib/permissions/matrix.ts): qualquer membro abre o caixa; o funcionário fecha só o que ele
  // mesmo abriu; sangria/suprimento ficam com owner/admin. Reforço de UX apenas: a autorização real está nas RPCs
  // (open_cash_register/close_cash_register/create_cash_movement), que recusam mesmo se alguém chamar a Server Action
  // diretamente sem passar pelo formulário.
  const user = await getCurrentUser();
  const canOpen = can(current.role, "cash.open");
  const canMove = can(current.role, "cash.manual_movement");

  const openRegister = await getCurrentOpenCashRegister(current.company.id);

  if (!openRegister) {
    const lastClosed = await getLastClosedCashRegister(current.company.id);

    return (
      <div className="prime-module-page prime-module-page--caixa flex flex-col gap-6 px-4 py-6 sm:px-6">
        <PageHeader title="Caixa" description="Controle de abertura, movimentações e fechamento do caixa." />

        <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <Lock className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="text-sm font-medium text-foreground">Caixa fechado</span>
        </div>

        {lastClosed && (
          <div className="rounded-xl border border-border bg-card/60 p-5">
            <h2 className="text-sm font-semibold text-muted-foreground">Último fechamento</h2>
            <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Saldo esperado</dt>
                <dd className="text-sm font-medium text-foreground">
                  {formatMoney(Number(lastClosed.expected_cash_balance))}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Saldo informado</dt>
                <dd className="text-sm font-medium text-foreground">
                  {formatMoney(Number(lastClosed.informed_cash_balance))}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Diferença</dt>
                <dd className="text-sm font-medium text-foreground">
                  {formatMoney(Number(lastClosed.cash_difference))}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Fechado por</dt>
                <dd className="text-sm font-medium text-foreground">
                  {lastClosed.closed_by_name ?? "—"}
                  {lastClosed.closed_at && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {dateTimeFormatter.format(new Date(lastClosed.closed_at))}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        )}

        <div className="max-w-xl rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Abrir caixa</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe o saldo inicial em dinheiro para começar um novo turno.
          </p>
          {canOpen ? (
            <div className="mt-4">
              <CashRegisterOpenForm />
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Você não tem permissão para abrir o caixa. Peça ao owner ou a um admin da empresa.
            </p>
          )}
        </div>
      </div>
    );
  }

  const movements = await listCashMovements(openRegister.id);
  const summary = summarizeCashMovements(Number(openRegister.opening_balance), movements);

  return (
    <div className="prime-module-page prime-module-page--caixa flex flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader title="Caixa" description="Controle de abertura, movimentações e fechamento do caixa." />

      <div className="flex flex-col gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15">
            <Unlock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
          </span>
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Caixa aberto</span>
        </div>
        <span className="text-xs text-muted-foreground">
          Aberto por {openRegister.opened_by_name ?? "—"} em {dateTimeFormatter.format(new Date(openRegister.opened_at))}
        </span>
      </div>

      <CashRegisterSummaryCards summary={summary} />

      {canMove && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Lançar movimentação</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sangria, suprimento ou outra entrada/saída avulsa do caixa.
          </p>
          <div className="mt-4">
            <CashMovementForm />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Movimentações</h2>
        <CashMovementsTable movements={movements} />
      </div>

      {canCloseCashRegister(current.role, openRegister.opened_by, user?.id) ? (
        <div className="max-w-xl rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Fechar caixa</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Conte o dinheiro na gaveta e informe o valor para conferência.
          </p>
          <div className="mt-4">
            <CashRegisterCloseForm
              cashRegisterId={openRegister.id}
              expectedCashBalance={summary.expectedCashBalance}
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Só quem abriu o caixa, o owner ou um admin podem fechá-lo. Aberto desde {formatDate(openRegister.opened_at)}.
        </p>
      )}
    </div>
  );
}
