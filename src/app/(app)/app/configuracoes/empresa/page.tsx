import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CompanyEditForm } from "@/components/settings/company-edit-form";
import { CompanyLogoCard } from "@/components/settings/company-logo-card";
import { CompanyProfileForm } from "@/components/settings/company-profile-form";
import { QuoteDefaultsForm } from "@/components/settings/quote-defaults-form";
import { QuoteStyleForm } from "@/components/settings/quote-style-form";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { getCompanyLogoMeta, getCurrentCompany, getQuoteDefaults, getQuoteStyle } from "@/lib/companies/queries";
import { appSettingsNav, canEditCompany } from "@/lib/settings/nav";

export const metadata: Metadata = { title: "Empresa" };

/**
 * Dados da empresa: nome e segmento, dados cadastrais, logo e padrões dos orçamentos. Funcionário não vê esta tela
 * (volta para a visão geral); o banco confere o papel de novo em cada gravação.
 */
export default async function CompanySettingsPage() {
  const { company, role } = (await getCurrentCompany())!;
  if (!canEditCompany(role)) redirect("/app/configuracoes");

  const [logo, quoteDefaults, quoteStyle] = await Promise.all([getCompanyLogoMeta(company.id), getQuoteDefaults(company.id), getQuoteStyle(company.id)]);

  return (
    <SettingsPageShell title="Empresa" description="Nome, dados cadastrais, logo e padrões dos orçamentos." nav={appSettingsNav(role)}>
      <SettingsSection
        id="empresa-dados"
        title="Dados da empresa"
        description="Plano, assinatura e situação da empresa não mudam aqui."
        badge={<Badge variant={company.status === "active" ? "success" : "muted"}>{company.status === "active" ? "Ativa" : "Inativa"}</Badge>}
      >
        <CompanyEditForm name={company.name} businessType={company.business_type} />
      </SettingsSection>

      <SettingsSection
        id="empresa-cadastro"
        title="Dados cadastrais"
        description="Aparecem no PDF dos orçamentos que você enviar aos seus clientes. Preencha o que quiser mostrar."
      >
        <CompanyProfileForm
          values={{
            legal_name: company.legal_name ?? null,
            document: company.document ?? null,
            phone: company.phone ?? null,
            whatsapp: company.whatsapp ?? null,
            email: company.email ?? null,
            website: company.website ?? null,
            postal_code: company.postal_code ?? null,
            address: company.address ?? null,
            address_number: company.address_number ?? null,
            complement: company.complement ?? null,
            neighborhood: company.neighborhood ?? null,
            city: company.city ?? null,
            state: company.state ?? null,
          }}
        />
      </SettingsSection>

      <SettingsSection id="empresa-logo" title="Logo" description="Aparece no topo do PDF do orçamento.">
        <CompanyLogoCard hasLogo={Boolean(logo)} version={logo ? String(Date.parse(logo.updatedAt) || 0) : null} />
      </SettingsSection>

      <SettingsSection
        id="empresa-orcamentos"
        title="Padrões dos orçamentos"
        description="Valem para todo orçamento novo. Em cada orçamento você ainda pode trocar."
      >
        <QuoteDefaultsForm values={quoteDefaults} />
      </SettingsSection>

      <SettingsSection
        id="empresa-aparencia-orcamento"
        title="Aparência do orçamento"
        description="Modelo, cor da marca, texto de apresentação, Pix com QR Code e aceite do PDF que você envia ao cliente."
      >
        <QuoteStyleForm values={quoteStyle} />
      </SettingsSection>
    </SettingsPageShell>
  );
}
