import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CreditCard,
  FileText,
  Gift,
  KeyRound,
  Palette,
  ShieldCheck,
  Smartphone,
  Tags,
  UserCircle,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { Badge } from "@/components/ui/badge";
import { getCurrentCompany } from "@/lib/companies/queries";
import { formatDate } from "@/lib/format";
import { appSettingsNav, canEditCompany } from "@/lib/settings/nav";
import { BUSINESS_TYPE_LABELS, type CompanyRole } from "@/types/company";

export const metadata: Metadata = { title: "Configurações" };

const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  employee: "Funcionário",
};

interface SettingsLink {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Documentos legais abrem no site público. */
  external?: boolean;
}

interface SettingsGroup {
  title: string;
  description: string;
  links: SettingsLink[];
}

/**
 * Central de configurações: reúne, num só lugar, os atalhos para onde cada ajuste existe no sistema. A visão geral é só
 * leitura e navegação (não altera nenhum dado nem cria permissão nova: cada destino continua com a sua própria regra de
 * acesso, aplicada no servidor). As alterações acontecem nas abas Perfil, Segurança, Aparência e Empresa.
 */
const GROUPS: SettingsGroup[] = [
  {
    title: "Minha conta",
    description: "Seus dados pessoais, a segurança do login e o visual do sistema.",
    links: [
      { label: "Perfil", description: "Nome, foto, e-mail e telefone.", href: "/app/configuracoes/perfil", icon: UserCircle },
      { label: "Segurança", description: "Senha, verificação em duas etapas e aparelhos conectados.", href: "/app/configuracoes/seguranca", icon: KeyRound },
      { label: "Aparência", description: "Tema escuro, claro ou automático.", href: "/app/configuracoes/aparencia", icon: Palette },
      { label: "Aplicativo", description: "Instale o Prime Ges na tela inicial do celular.", href: "/app/configuracoes/aplicativo", icon: Smartphone },
    ],
  },
  {
    title: "Pessoas e plano",
    description: "Quem acessa o sistema e qual plano a empresa usa.",
    links: [
      { label: "Equipe e permissões", description: "Colaboradores, funções e fichas profissionais.", href: "/app/equipe", icon: UserCog },
      { label: "Assinatura", description: "Plano atual, validade e histórico de pagamentos.", href: "/app/assinatura", icon: CreditCard },
    ],
  },
  {
    title: "Catálogo e programa de pontos",
    description: "Como produtos, serviços e fidelidade são organizados.",
    links: [
      { label: "Categorias de produtos", description: "Agrupe os produtos para filtrar e relatar melhor.", href: "/app/produtos/categorias", icon: Tags },
      { label: "Categorias de serviços", description: "Agrupe os serviços oferecidos.", href: "/app/servicos/categorias", icon: Tags },
      { label: "Programa de fidelidade", description: "Pontos, níveis, multiplicadores e campanhas.", href: "/app/fidelidade", icon: Gift },
    ],
  },
  {
    title: "Privacidade e documentos",
    description: "Seus dados, aceite dos termos e documentos legais.",
    links: [
      { label: "Privacidade e segurança", description: "Aceite dos termos, histórico e exclusão da conta.", href: "/conta", icon: ShieldCheck },
      { label: "Termos de Uso", description: "Regras de uso do Prime Ges.", href: "/termos-de-uso", icon: FileText, external: true },
      { label: "Política de Privacidade", description: "Como os dados são tratados (LGPD).", href: "/politica-de-privacidade", icon: FileText, external: true },
      { label: "Política de Reembolso", description: "Condições de cancelamento e reembolso.", href: "/politica-de-reembolso", icon: FileText, external: true },
      { label: "Direitos do Titular", description: "Como exercer seus direitos sobre os dados.", href: "/direitos-do-titular", icon: FileText, external: true },
    ],
  },
];

export default async function SettingsPage() {
  const current = (await getCurrentCompany())!;
  const { company, role } = current;

  return (
    <SettingsPageShell
      title="Configurações"
      description="Sua conta, os dados da empresa e atalhos para os ajustes do sistema."
      nav={appSettingsNav(role)}
      wide
    >

      <section className="rounded-xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-soft" aria-labelledby="config-empresa">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary-text">
            <Building2 className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Sua empresa</p>
            <h2 id="config-empresa" className="truncate text-xl font-semibold text-foreground">
              {company.name}
            </h2>
          </div>
          <Badge variant={company.status === "active" ? "success" : "muted"} className="ml-auto shrink-0">
            {company.status === "active" ? "Ativa" : "Inativa"}
          </Badge>
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3 [&>div]:rounded-lg [&>div]:border [&>div]:border-border [&>div]:bg-background/40 [&>div]:p-3">
          <div>
            <dt className="text-muted-foreground">Segmento</dt>
            <dd className="font-medium text-foreground">{BUSINESS_TYPE_LABELS[company.business_type]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Seu acesso</dt>
            <dd className="font-medium text-foreground">{ROLE_LABELS[role]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Cadastrada em</dt>
            <dd className="font-medium text-foreground">{formatDate(company.created_at)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          {canEditCompany(role) ? (
            <>
              Para mudar o nome ou o segmento, use a aba{" "}
              <Link href="/app/configuracoes/empresa" className="font-medium text-primary-text underline-offset-4 hover:underline">
                Empresa
              </Link>
              .
            </>
          ) : (
            "Só o proprietário ou um administrador da empresa pode alterar o nome e o segmento."
          )}
        </p>
      </section>

      {GROUPS.map((group) => (
        <section key={group.title} aria-labelledby={`grupo-${group.title}`}>
          <div className="mb-3">
            <h2 id={`grupo-${group.title}`} className="text-base font-semibold text-foreground">
              {group.title}
            </h2>
            <p className="text-sm text-muted-foreground">{group.description}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="prime-card group flex h-full items-start gap-3 rounded-xl border border-border bg-card/60 p-4 outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-text">
                    <link.icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">{link.label}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{link.description}</span>
                  </span>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  {link.external && <span className="sr-only">(abre em nova aba)</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </SettingsPageShell>
  );
}
