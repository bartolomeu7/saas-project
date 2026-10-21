import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BLOCKED_MESSAGES,
  isDeletionConfirmed,
  mapDeletionError,
  parseDeletionPreview,
  summarizeDeletion,
} from "../../src/lib/account/deletion-core.ts";
import { buildAccountDeletedEmail } from "../../src/lib/account/email-content.ts";

const company = (over = {}) => ({
  company_id: "11111111-1111-1111-1111-111111111111",
  name: "Padaria Teste",
  role: "owner",
  other_members: 0,
  other_owners: 0,
  will_delete: true,
  blocks: false,
  has_paid_plan: false,
  expires_at: null,
  ...over,
});
const raw = (over = {}) => ({ found: true, blocked_reason: null, email: "a@example.invalid", full_name: "Ana Souza", clerk_user_id: "user_x", companies: [company()], ...over });

describe("confirmação digitada", () => {
  it("aceita EXCLUIR (com espaços e em qualquer caixa)", () => {
    for (const ok of ["EXCLUIR", " excluir ", "Excluir"]) assert.equal(isDeletionConfirmed(ok), true, ok);
  });
  it("recusa qualquer outra coisa", () => {
    for (const bad of ["", "excluir conta", "EXCLUI", "SIM", null, undefined, 1, {}]) assert.equal(isDeletionConfirmed(bad), false, String(bad));
  });
});

describe("leitura da prévia vinda do banco", () => {
  it("lê um retorno válido", () => {
    const p = parseDeletionPreview(raw());
    assert.equal(p.blockedReason, null);
    assert.equal(p.companies[0].willDelete, true);
    assert.equal(p.email, "a@example.invalid");
  });
  it("recusa formato inesperado (a ação então não segue)", () => {
    for (const bad of [null, undefined, "x", 1, {}, { found: false }, raw({ companies: "x" }), raw({ blocked_reason: "OUTRO" }), raw({ companies: [null] }), raw({ companies: [{ name: "sem id" }] })]) {
      assert.equal(parseDeletionPreview(bad), null);
    }
  });
  it("preserva o motivo do impedimento", () => {
    assert.equal(parseDeletionPreview(raw({ blocked_reason: "OWNS_TEAM_COMPANY" })).blockedReason, "OWNS_TEAM_COMPANY");
    assert.equal(parseDeletionPreview(raw({ blocked_reason: "PLATFORM_ADMIN" })).blockedReason, "PLATFORM_ADMIN");
  });
});

describe("resumo do que será apagado", () => {
  it("separa empresas apagadas, empresas de que só sai e planos pagos vigentes", () => {
    const p = parseDeletionPreview(
      raw({
        companies: [
          company({ company_id: "a", name: "A", will_delete: true, has_paid_plan: true, expires_at: "2027-01-01T00:00:00Z" }),
          company({ company_id: "b", name: "B", will_delete: true }),
          company({ company_id: "c", name: "C", will_delete: false, role: "employee", other_members: 3 }),
        ],
      })
    );
    const s = summarizeDeletion(p);
    assert.deepEqual(s.toDelete.map((c) => c.name), ["A", "B"]);
    assert.deepEqual(s.toLeave.map((c) => c.name), ["C"]);
    assert.deepEqual(s.withPaidPlan.map((c) => c.name), ["A"]);
  });
});

describe("erros do banco viram mensagens seguras", () => {
  it("impedimentos têm mensagem própria", () => {
    assert.equal(mapDeletionError("ACCOUNT_DELETE_BLOCKED:OWNS_TEAM_COMPANY").error, BLOCKED_MESSAGES.OWNS_TEAM_COMPANY);
    assert.equal(mapDeletionError("ACCOUNT_DELETE_BLOCKED:PLATFORM_ADMIN").code, "PLATFORM_ADMIN");
    assert.equal(mapDeletionError("ACCOUNT_NOT_FOUND").code, "ACCOUNT_NOT_FOUND");
  });
  it("erro desconhecido nunca vaza o texto do Postgres", () => {
    const r = mapDeletionError('insert or update on table "x" violates foreign key constraint "secret_fk"');
    assert.equal(r.code, "DELETE_FAILED");
    assert.ok(!r.error.includes("secret_fk") && !r.error.includes("constraint"));
    assert.ok(r.error.includes("Nada foi apagado"));
  });
});

describe("e-mail de confirmação", () => {
  it("usa só o primeiro nome e diz o que foi apagado e o que a lei manda guardar", () => {
    const m = buildAccountDeletedEmail({ fullName: "Ana Maria Souza", companiesDeleted: 1, companiesLeft: 0 });
    assert.ok(m.text.startsWith("Olá, Ana."));
    assert.ok(!m.text.includes("Souza"));
    assert.ok(m.text.includes("5 anos"));
    assert.ok(m.text.includes("10 a 15 dias úteis"));
    assert.ok(m.subject.includes("excluída"));
  });
  it("escapa HTML do nome", () => {
    const m = buildAccountDeletedEmail({ fullName: '<script>alert(1)</script> X', companiesDeleted: 0, companiesLeft: 0 });
    assert.ok(!m.html.includes("<script>"));
  });
  it("sem nome, cumprimenta sem inventar", () => {
    assert.ok(buildAccountDeletedEmail({ fullName: null, companiesDeleted: 0, companiesLeft: 0 }).text.startsWith("Olá."));
  });
});

describe("integração (estática) da exclusão", () => {
  const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");

  it("a Server Action nunca aceita id do formulário: usa a sessão", () => {
    const src = read("src/lib/account/actions.ts");
    assert.ok(src.includes("getCurrentUser()"));
    assert.ok(!/formData\.get\(["'](user|userId|user_id|id)["']\)/.test(src));
    assert.ok(src.includes("p_user_id: user.id"));
  });
  it("as funções do banco só são concedidas a service_role", () => {
    const sql = read("supabase/migrations/20261022000000_account_self_deletion.sql");
    assert.ok(/revoke all on function public\.delete_account_data\(uuid\) from public, anon, authenticated/.test(sql));
    assert.ok(/grant execute on function public\.delete_account_data\(uuid\) to service_role/.test(sql));
    assert.ok(!/grant execute on function public\.delete_account_data\(uuid\) to authenticated/.test(sql));
  });
  it("a página fica protegida pelo middleware e fora do índice de busca", () => {
    assert.ok(/PROTECTED_PREFIXES = \[[^\]]*"\/conta"/.test(read("src/middleware.ts")));
    assert.ok(read("src/app/robots.ts").includes('"/conta"'));
  });
});
