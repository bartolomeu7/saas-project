import type { Metadata } from "next";
import { getCurrentCompany } from "@/lib/companies/queries";
import {
  getLoyaltySettings,
  getLoyaltyTierThresholds,
  getLoyaltyMultipliers,
  getLoyaltyCampaigns,
} from "@/lib/loyalty/queries";
import { DEFAULT_TIER_THRESHOLDS } from "@/lib/loyalty/tiers";
import { LoyaltyTabs } from "@/components/app/loyalty-tabs";
import { LoyaltySettingsForm } from "@/components/app/loyalty-settings-form";
import { LoyaltyTiersSection } from "@/components/app/loyalty-tiers-section";
import { LoyaltyMultipliersSection } from "@/components/app/loyalty-multipliers-section";
import { LoyaltyCampaignsSection } from "@/components/app/loyalty-campaigns-section";

export const metadata: Metadata = {
  title: "Fidelidade",
};

const VALID_TABS = ["configuracoes", "multiplicadores", "niveis", "campanhas"] as const;
type TabKey = (typeof VALID_TABS)[number];

function parseTab(value?: string): TabKey {
  return (VALID_TABS as readonly string[]).includes(value ?? "")
    ? (value as TabKey)
    : "configuracoes";
}

export default async function LoyaltyPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const current = (await getCurrentCompany())!;
  const tab = parseTab(searchParams?.tab);

  // Cada aba só busca os dados que realmente usa.
  const settings =
    tab === "configuracoes" ? await getLoyaltySettings(current.company.id) : null;
  const tierThresholdsFromDb =
    tab === "niveis" ? await getLoyaltyTierThresholds(current.company.id) : [];
  const multipliers =
    tab === "multiplicadores" ? await getLoyaltyMultipliers(current.company.id) : [];
  const campaigns = tab === "campanhas" ? await getLoyaltyCampaigns(current.company.id) : [];

  const canEdit = current.role === "owner" || current.role === "admin";
  const usingDefaultTiers = tab === "niveis" && tierThresholdsFromDb.length === 0;
  const tierThresholds = usingDefaultTiers ? DEFAULT_TIER_THRESHOLDS : tierThresholdsFromDb;

  return (
    <div className="prime-module-page prime-module-page--fidelidade flex flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fidelidade</h1>
        <p className="text-sm text-muted-foreground">
          Configure o programa de pontos da sua empresa.
        </p>
      </div>

      <div className="max-w-3xl">
        <LoyaltyTabs activeTab={tab} />

        <div className="pt-6">
          {tab === "configuracoes" && (
            <LoyaltySettingsForm settings={settings} canEdit={canEdit} />
          )}

          {tab === "niveis" && (
            <LoyaltyTiersSection
              thresholds={tierThresholds}
              usingDefaults={usingDefaultTiers}
              canEdit={canEdit}
            />
          )}

          {tab === "multiplicadores" && (
            <LoyaltyMultipliersSection multipliers={multipliers} canEdit={canEdit} />
          )}

          {tab === "campanhas" && (
            <LoyaltyCampaignsSection campaigns={campaigns} canEdit={canEdit} />
          )}
        </div>
      </div>
    </div>
  );
}
