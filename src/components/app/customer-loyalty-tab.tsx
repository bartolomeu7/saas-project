import { Coins, Trophy, Sparkles } from "lucide-react";
import {
  getLoyaltySettings,
  getLoyaltyAccount,
  listLoyaltyTransactions,
  getLoyaltyTierThresholds,
} from "@/lib/loyalty/queries";
import { calculateLoyaltyTier, nextLoyaltyTier } from "@/lib/loyalty/tiers";
import { DashboardCard } from "@/components/app/dashboard-card";
import { EmptyState } from "@/components/app/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import type { LoyaltyTransactionSource, LoyaltyTransactionType } from "@/types/loyalty";

const TYPE_LABELS: Record<LoyaltyTransactionType, string> = {
  ganho: "Ganho",
  resgate: "Resgate",
  ajuste: "Ajuste",
  expirado: "Expiração",
  reversao: "Reversão",
};

const TYPE_STYLES: Record<LoyaltyTransactionType, string> = {
  ganho: "bg-success/10 text-success",
  resgate: "bg-primary/10 text-primary",
  ajuste: "bg-warning/10 text-warning",
  expirado: "bg-muted text-muted-foreground",
  reversao: "bg-destructive/10 text-destructive",
};

const SOURCE_LABELS: Record<LoyaltyTransactionSource, string> = {
  sale: "Venda",
  manual: "Ajuste manual",
  campaign: "Campanha",
  birthday: "Aniversário",
  first_purchase: "Primeira compra",
  expiration: "Expiração",
  reversal: "Reversão",
};

function TransactionTypeBadge({ type }: { type: LoyaltyTransactionType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_STYLES[type]}`}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}

/** Skeleton exibido enquanto CustomerLoyaltyTab carrega dentro do <Suspense> — só esta aba, sem afetar as demais. */
export function CustomerLoyaltyTabSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
            <Skeleton className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="divide-y divide-border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Aba "Fidelidade" do perfil do cliente. Busca os próprios dados (em vez
 * de recebê-los prontos do page.tsx, diferente das outras abas) para
 * poder ficar dentro de um <Suspense> isolado — só esta aba mostra um
 * skeleton enquanto carrega, sem alterar o comportamento das outras 7
 * abas já existentes nesta mesma página. Reaproveita integralmente as
 * queries e o cálculo de nível da Etapa 1C — nenhuma lógica nova de
 * saldo/nível é criada aqui.
 */
export async function CustomerLoyaltyTab({
  companyId,
  customerId,
  canConfigure,
}: {
  companyId: string;
  customerId: string;
  /** owner/admin — só controla se o link "Configurar fidelidade" aparece quando o programa está desativado. */
  canConfigure: boolean;
}) {
  const settings = await getLoyaltySettings(companyId);

  if (!settings?.enabled) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Programa de fidelidade desativado para esta empresa."
        description={
          canConfigure
            ? "Habilite a fidelidade para começar a conceder pontos aos clientes."
            : undefined
        }
        actionLabel={canConfigure ? "Configurar fidelidade" : undefined}
        actionHref={canConfigure ? "/app/fidelidade" : undefined}
      />
    );
  }

  const [account, transactions, tierThresholdsFromDb] = await Promise.all([
    getLoyaltyAccount(companyId, customerId),
    listLoyaltyTransactions(companyId, customerId),
    getLoyaltyTierThresholds(companyId),
  ]);

  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={Coins}
        title="Este cliente ainda não participou do programa de fidelidade."
        description="Pontos aparecem aqui assim que uma venda concluída gerar fidelidade para este cliente."
      />
    );
  }

  // Vazio (empresa ainda não configurou níveis) faz calculateLoyaltyTier/
  // nextLoyaltyTier usarem DEFAULT_TIER_THRESHOLDS automaticamente (valor
  // padrão dos parâmetros) — não passamos [] explicitamente.
  const thresholds = tierThresholdsFromDb.length > 0 ? tierThresholdsFromDb : undefined;
  const tier = calculateLoyaltyTier(account.lifetimePoints, thresholds);
  const next = nextLoyaltyTier(account.lifetimePoints, thresholds);

  const progressPercent = (() => {
    if (!next) return 100;
    const span = next.tier.minLifetimePoints - tier.minLifetimePoints;
    if (span <= 0) return 100;
    return Math.min(
      100,
      Math.max(0, ((account.lifetimePoints - tier.minLifetimePoints) / span) * 100)
    );
  })();

  return (
    <div className="flex flex-col gap-6">
      {account.balance < 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <p className="font-medium">Saldo de pontos negativo</p>
          <p className="mt-0.5 text-xs">
            Os pontos serão recuperados conforme novos pontos forem ganhos.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <DashboardCard label="Saldo atual" value={account.balance} icon={Coins} />
        <DashboardCard label="Pontos vitalícios" value={account.lifetimePoints} icon={Trophy} />
        <DashboardCard
          label="Próximo nível"
          value={next ? next.tier.name : "Nível máximo"}
          icon={Sparkles}
          hint={next ? `Faltam ${next.pointsRemaining} pontos` : "Nível máximo alcançado."}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">
            Nível atual: <span className="font-semibold">{tier.name}</span>
          </p>
          {next && (
            <p className="text-xs text-muted-foreground">
              {progressPercent.toFixed(0)}% para {next.tier.name}
            </p>
          )}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
          Últimas movimentações
        </h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Pontos</th>
                <th className="px-4 py-3 font-medium">Saldo após</th>
                <th className="px-4 py-3 font-medium">Origem</th>
                <th className="px-4 py-3 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(transaction.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <TransactionTypeBadge type={transaction.type} />
                  </td>
                  <td
                    className={`px-4 py-3 font-medium ${
                      transaction.points > 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {transaction.points > 0 ? `+${transaction.points}` : transaction.points}
                  </td>
                  <td className="px-4 py-3 text-foreground">{transaction.balanceAfter}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {SOURCE_LABELS[transaction.source]}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {transaction.reason ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
