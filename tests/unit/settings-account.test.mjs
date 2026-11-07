import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import { computeSecurityLevel } from "../../src/lib/settings/security-level.ts";
import { clerkErrorCode, describeClerkError, GENERIC_CLERK_ERROR } from "../../src/lib/settings/clerk-errors.ts";
import { formatPhoneDisplay, normalizePhoneInput } from "../../src/lib/settings/phone.ts";
import { DEFAULT_THEME, normalizeTheme, resolveTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "../../src/lib/settings/theme.ts";
import { appSettingsNav, canEditCompany } from "../../src/lib/settings/nav.ts";

/**
 * Configurações da conta (perfil, segurança, aparência, empresa): regras puras + travas de segurança do código.
 */
const base = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, base), "utf8");

describe("nível de segurança da conta", () => {
  const none = { hasPassword: false, hasVerifiedEmail: false, hasVerifiedPhone: false, twoFactorEnabled: false, hasBackupCodes: false };

  it("conta sem nada é Básico, com 0 pontos", () => {
    const level = computeSecurityLevel(none);
    assert.equal(level.name, "basic");
    assert.equal(level.score, 0);
  });

  it("e-mail + senha sem duas etapas é no máximo Bom (40 pontos)", () => {
    const level = computeSecurityLevel({ ...none, hasPassword: true, hasVerifiedEmail: true, hasVerifiedPhone: true });
    assert.equal(level.name, "good");
    assert.equal(level.score, 50);
  });

  it("sem duas etapas a conta NUNCA chega a Forte, mesmo com todo o resto", () => {
    const level = computeSecurityLevel({ ...none, hasPassword: true, hasVerifiedEmail: true, hasVerifiedPhone: true, hasBackupCodes: true });
    assert.notEqual(level.name, "strong");
    // códigos de backup só contam quando as duas etapas estão ativas
    assert.equal(level.checks.find((c) => c.id === "backup").done, false);
  });

  it("tudo ligado é Forte, com 100 pontos", () => {
    const level = computeSecurityLevel({ hasPassword: true, hasVerifiedEmail: true, hasVerifiedPhone: true, twoFactorEnabled: true, hasBackupCodes: true });
    assert.equal(level.name, "strong");
    assert.equal(level.score, 100);
  });

  it("duas etapas ativas mas sem e-mail/senha ficam em Bom, não em Forte", () => {
    const level = computeSecurityLevel({ ...none, twoFactorEnabled: true });
    assert.equal(level.name, "good");
  });

  it("os pontos dos itens somam exatamente 100", () => {
    const total = computeSecurityLevel(none).checks.reduce((sum, c) => sum + c.points, 0);
    assert.equal(total, 100);
  });
});

describe("mensagens de erro do Clerk", () => {
  const clerkError = (code) => ({ errors: [{ code, message: "interno em inglês", longMessage: "detalhe técnico interno" }] });

  it("traduz os códigos conhecidos", () => {
    assert.match(describeClerkError(clerkError("form_password_incorrect")), /senha atual está incorreta/i);
    assert.match(describeClerkError(clerkError("form_password_pwned")), /vazamentos/);
    assert.match(describeClerkError(clerkError("form_code_incorrect")), /código está incorreto/);
    assert.match(describeClerkError(clerkError("verification_expired")), /expirou/);
    assert.match(describeClerkError(clerkError("form_identifier_exists")), /Já existe/);
  });

  it("código desconhecido ou erro qualquer vira a mensagem genérica, sem vazar texto técnico", () => {
    assert.equal(describeClerkError(clerkError("algo_novo_do_clerk")), GENERIC_CLERK_ERROR);
    assert.equal(describeClerkError(new Error("falha de rede com token abc")), GENERIC_CLERK_ERROR);
    assert.equal(describeClerkError(null), GENERIC_CLERK_ERROR);
    assert.equal(describeClerkError("texto"), GENERIC_CLERK_ERROR);
    assert.doesNotMatch(describeClerkError(clerkError("algo_novo_do_clerk")), /interno|técnico|token/);
  });

  it("clerkErrorCode devolve o código do primeiro erro ou null", () => {
    assert.equal(clerkErrorCode(clerkError("form_password_pwned")), "form_password_pwned");
    assert.equal(clerkErrorCode({ errors: [] }), null);
    assert.equal(clerkErrorCode(undefined), null);
  });
});

describe("telefone (formato internacional do Clerk)", () => {
  it("número brasileiro sem +55 ganha o prefixo", () => {
    assert.equal(normalizePhoneInput("(11) 99999-8888"), "+5511999998888");
    assert.equal(normalizePhoneInput("11 3333-4444"), "+551133334444");
    assert.equal(normalizePhoneInput("  11999998888  "), "+5511999998888");
  });

  it("aceita 55 digitado sem + e mantém números internacionais com +", () => {
    assert.equal(normalizePhoneInput("5511999998888"), "+5511999998888");
    assert.equal(normalizePhoneInput("+1 (415) 555-0100"), "+14155550100");
    assert.equal(normalizePhoneInput("+351 912 345 678"), "+351912345678");
  });

  it("recusa entradas inválidas", () => {
    for (const bad of ["", "   ", "abc", "123", "999", "+12", "119999", "1".repeat(20), "+" + "1".repeat(16)]) {
      assert.equal(normalizePhoneInput(bad), null, JSON.stringify(bad));
    }
  });

  it("máscara de exibição", () => {
    assert.equal(formatPhoneDisplay("+5511999998888"), "+55 (11) 99999-8888");
    assert.equal(formatPhoneDisplay("+551133334444"), "+55 (11) 3333-4444");
    assert.equal(formatPhoneDisplay("+14155550100"), "+14155550100");
  });
});

describe("tema", () => {
  it("o padrão continua sendo o escuro", () => {
    assert.equal(DEFAULT_THEME, "dark");
    assert.equal(normalizeTheme(null), "dark");
    assert.equal(normalizeTheme(undefined), "dark");
  });

  it("valor desconhecido (storage adulterado) vira o padrão", () => {
    for (const bad of ["", "blue", "LIGHT", "<script>", 1, {}, []]) assert.equal(normalizeTheme(bad), "dark");
    for (const ok of ["dark", "light", "system"]) assert.equal(normalizeTheme(ok), ok);
  });

  it("automático acompanha o aparelho; os outros ignoram o aparelho", () => {
    assert.equal(resolveTheme("system", true), "light");
    assert.equal(resolveTheme("system", false), "dark");
    assert.equal(resolveTheme("light", false), "light");
    assert.equal(resolveTheme("dark", true), "dark");
  });

  it("o script de partida só lê a chave do tema, tira a classe dark apenas para claro/automático e não quebra sem storage", () => {
    assert.ok(THEME_INIT_SCRIPT.includes(`"${THEME_STORAGE_KEY}"`));
    assert.match(THEME_INIT_SCRIPT, /try\{/);
    assert.match(THEME_INIT_SCRIPT, /catch\(e\)\{\}/);
    assert.doesNotMatch(THEME_INIT_SCRIPT, /fetch|XMLHttpRequest|document\.cookie|eval\(|innerHTML/);
    // executa de verdade: simula navegador com tema claro, automático e escuro
    const run = (stored, prefersLight) => {
      const classes = new Set(["dark"]);
      const root = { classList: { remove: (c) => classes.delete(c) }, style: {} };
      const win = { matchMedia: () => ({ matches: prefersLight }) };
      const storage = { getItem: (k) => (k === THEME_STORAGE_KEY ? stored : null) };
      runInNewContext(THEME_INIT_SCRIPT, { localStorage: storage, window: win, document: { documentElement: root } });
      return classes.has("dark") ? "dark" : "light";
    };
    assert.equal(run("light", false), "light");
    assert.equal(run("system", true), "light");
    assert.equal(run("system", false), "dark");
    assert.equal(run("dark", true), "dark");
    assert.equal(run(null, true), "dark");
    assert.equal(run("qualquer-coisa", true), "dark");
    // storage bloqueado não pode derrubar a página
    const throwing = { getItem: () => { throw new Error("blocked"); } };
    assert.doesNotThrow(() =>
      runInNewContext(THEME_INIT_SCRIPT, {
        localStorage: throwing,
        window: { matchMedia: () => ({ matches: true }) },
        document: { documentElement: { classList: { remove() {} }, style: {} } },
      })
    );
  });
});

describe("abas de Configurações por papel", () => {
  it("só proprietário e administrador editam a empresa", () => {
    assert.equal(canEditCompany("owner"), true);
    assert.equal(canEditCompany("admin"), true);
    assert.equal(canEditCompany("employee"), false);
  });

  it("funcionário não vê a aba Empresa; owner/admin veem; todos veem Perfil, Segurança e Aparência", () => {
    const labels = (role) => appSettingsNav(role).map((i) => i.label);
    assert.deepEqual(labels("employee"), ["Visão geral", "Perfil", "Segurança", "Aparência"]);
    assert.deepEqual(labels("owner"), ["Visão geral", "Perfil", "Segurança", "Aparência", "Empresa"]);
    assert.deepEqual(labels("admin"), labels("owner"));
  });

  it("toda aba aponta para uma página que existe", () => {
    for (const item of appSettingsNav("owner")) {
      const file = `src/app/(app)${item.href}/page.tsx`;
      assert.ok(existsSync(new URL(file, base)), file);
    }
  });
});

describe("travas de segurança do código", () => {
  const companyActions = read("src/lib/companies/actions.ts");
  const settingsActions = read("src/lib/settings/actions.ts");
  const migration = read("supabase/migrations/20261106000000_company_self_edit.sql");

  it("editar a empresa: nenhum id, papel ou status vem do formulário; só nome e segmento, via a função do banco", () => {
    const body = companyActions.slice(companyActions.indexOf("export async function updateOwnCompanyAction"), companyActions.indexOf("export async function requestFreeTrialAction"));
    assert.match(body, /createCompanySchema\.safeParse/);
    assert.match(body, /rpc\("update_own_company"/);
    assert.doesNotMatch(body, /company_id|companyId|formData\.get\("(role|status|id)/);
    assert.doesNotMatch(body, /\.from\("companies"\)/);
  });

  it("editar a empresa: a mensagem do banco só passa se for texto curado; o resto vira genérico", () => {
    assert.match(companyActions, /COMPANY_EDIT_SAFE_MESSAGES/);
    assert.match(companyActions, /Não foi possível salvar agora/);
  });

  it("sincronizar perfil: valores vêm do Clerk no servidor, nunca do navegador, e role/status não são tocados", () => {
    assert.match(settingsActions, /currentUser\(\)/);
    assert.doesNotMatch(settingsActions, /formData|FormData|request\.json/);
    assert.doesNotMatch(settingsActions, /\brole\b\s*:|\bstatus\s*:/);
    // só copia e-mail já verificado
    assert.match(settingsActions, /verification\?\.status === "verified"/);
  });

  it("migration: só owner/admin, sem policy nova, sem tocar status/plano, com auditoria e sem acesso anônimo", () => {
    assert.match(migration, /current_profile_user_id\(\)/);
    assert.doesNotMatch(migration, /\bauth\.uid\(\)/);
    assert.match(migration, /v_role not in \('owner', 'admin'\)/);
    assert.doesNotMatch(migration, /create policy|alter table|drop /i);
    assert.doesNotMatch(migration, /set\s+status|company_entitlements|subscription/i);
    assert.match(migration, /insert into public\.audit_logs/);
    assert.match(migration, /revoke all on function public\.update_own_company\(text, public\.business_type\) from anon/);
    assert.match(migration, /grant execute on function public\.update_own_company\(text, public\.business_type\) to authenticated, service_role/);
    assert.ok(existsSync(new URL("supabase/rollback/20261106000000_company_self_edit.down.sql", base)));
    assert.ok(existsSync(new URL("tests/sql/company_self_edit.sql", base)));
  });

  it("a aba Empresa manda funcionário de volta para a visão geral", () => {
    const page = read("src/app/(app)/app/configuracoes/empresa/page.tsx");
    assert.match(page, /if \(!canEditCompany\(role\)\) redirect\("\/app\/configuracoes"\)/);
  });

  it("os componentes de conta não guardam senha, código nem segredo fora da memória da tela", () => {
    for (const file of ["password-form", "two-factor-panel", "email-addresses-panel", "phone-numbers-panel", "profile-identity-form"]) {
      const source = read(`src/components/settings/${file}.tsx`);
      assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|console\.(log|info|debug)/, file);
      assert.doesNotMatch(source, /fetch\(/, `${file} não deve mandar dados da conta para o nosso servidor`);
    }
  });

  it("ações sensíveis do Clerk (e-mail, telefone, duas etapas) passam por reverificação", () => {
    assert.match(read("src/components/settings/email-addresses-panel.tsx"), /useReverification\(\(email: string\)/);
    assert.match(read("src/components/settings/phone-numbers-panel.tsx"), /useReverification\(\(phoneNumber: string\)/);
    const two = read("src/components/settings/two-factor-panel.tsx");
    for (const call of ["createTOTP", "disableTOTP", "createBackupCode"]) {
      assert.match(two, new RegExp(`useReverification\\(\\(\\) => user\\?\\.${call}\\(\\)\\)`), call);
    }
  });

  it("o painel /admin/account é só do próprio administrador (sem id de outro usuário) e super admin vê os atalhos extras", () => {
    const page = read("src/app/admin/account/page.tsx");
    assert.match(page, /requirePlatformAdmin\(\)/);
    assert.match(page, /superAdminOnly/);
    assert.doesNotMatch(page, /searchParams|params\./);
  });
});
