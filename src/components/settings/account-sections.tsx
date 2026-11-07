import { getCurrentUser } from "@/lib/auth/session";
import { getTwoFactorStatus } from "@/lib/security/two-factor/service";
import { ActiveDevices } from "@/components/settings/active-devices";
import { EmailAddressesPanel } from "@/components/settings/email-addresses-panel";
import { PasswordForm } from "@/components/settings/password-form";
import { PhoneNumbersPanel } from "@/components/settings/phone-numbers-panel";
import { ProfileIdentityForm } from "@/components/settings/profile-identity-form";
import { SecurityLevelCard } from "@/components/settings/security-level-card";
import { SettingsSection } from "@/components/settings/settings-section";
import { ThemePicker } from "@/components/settings/theme-picker";
import { TwoFactorPanel } from "@/components/settings/two-factor-panel";

/**
 * Blocos de conta compartilhados pela área da empresa (/app/configuracoes/*) e pelo painel (/admin/account), para que
 * as duas telas se comportem igual. Cada bloco fala direto com a conta da pessoa; nada daqui altera outra conta.
 */

export function ProfileSections() {
  return (
    <>
      <SettingsSection id="perfil" title="Foto e nome" description="Como você aparece no menu, na equipe e nos registros do sistema.">
        <ProfileIdentityForm />
      </SettingsSection>
      <SettingsSection id="emails" title="E-mails" description="O e-mail principal é o do seu login. Troque quando precisar.">
        <EmailAddressesPanel />
      </SettingsSection>
      <SettingsSection id="telefone" title="Telefone" description="Usado para confirmar a sua identidade. Enviamos um código por SMS.">
        <PhoneNumbersPanel />
      </SettingsSection>
    </>
  );
}

export async function SecuritySections() {
  const user = await getCurrentUser().catch(() => null);
  const twoFactor = user ? await getTwoFactorStatus(user.id) : { configured: false, enabled: false, backupCodesRemaining: 0 };

  return (
    <>
      <SettingsSection id="nivel" title="Nível de segurança" description="O que já protege a sua conta e o que ainda dá para melhorar.">
        <SecurityLevelCard twoFactorEnabled={twoFactor.enabled} backupCodesRemaining={twoFactor.backupCodesRemaining} />
      </SettingsSection>
      <SettingsSection id="senha" title="Senha" description="Troque a senha com regularidade e nunca a reutilize em outros sites.">
        <PasswordForm />
      </SettingsSection>
      <SettingsSection
        id="duas-etapas"
        title="Verificação em duas etapas"
        description="Além do login, o Prime Ges pede um código do Google Authenticator. É a melhor proteção contra invasão."
      >
        <TwoFactorPanel enabled={twoFactor.enabled} configured={twoFactor.configured} backupCodesRemaining={twoFactor.backupCodesRemaining} />
      </SettingsSection>
      <SettingsSection id="aparelhos" title="Aparelhos conectados" description="Onde a sua conta está aberta agora. Desconecte o que você não reconhece.">
        <ActiveDevices />
      </SettingsSection>
    </>
  );
}

export function AppearanceSection() {
  return (
    <SettingsSection id="tema" title="Tema" description="Escolha como o sistema aparece para você.">
      <ThemePicker />
    </SettingsSection>
  );
}
