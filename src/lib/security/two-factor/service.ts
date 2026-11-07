import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  BACKUP_CODE_COUNT,
  buildOtpauthUri,
  classifyCode,
  decryptSecret,
  deriveKeys,
  encryptSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  verifyTotp,
  type TwoFactorKeys,
} from "@/lib/security/two-factor/core";
import type { TwoFactorFailure } from "@/lib/security/two-factor/messages";

/**
 * Operações da verificação em duas etapas (servidor). Tudo passa pelo cliente de serviço (as tabelas não têm policy nem
 * privilégio para o usuário). Nada daqui confia em dado do navegador além do código digitado; quem chama já resolveu o
 * usuário e a sessão pelo Clerk no servidor.
 */

export interface TwoFactorStatus {
  /** A chave de cifra existe neste ambiente (sem ela o recurso fica indisponível). */
  configured: boolean;
  enabled: boolean;
  backupCodesRemaining: number;
}

function keys(): TwoFactorKeys | null {
  return deriveKeys(process.env.TWO_FACTOR_ENCRYPTION_KEY);
}

export function isTwoFactorConfigured(): boolean {
  return keys() !== null;
}

/** Sessões verificadas valem enquanto a sessão do Clerk existir (máx. 7 dias); linhas mais velhas são limpas. */
const VERIFICATION_RETENTION_MS = 8 * 24 * 60 * 60 * 1000;

export async function getTwoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const admin = createAdminClient();
  const configured = isTwoFactorConfigured();
  const { data, error } = await admin.from("user_two_factor").select("enabled").eq("user_id", userId).maybeSingle();
  if (error || !data?.enabled) return { configured, enabled: false, backupCodesRemaining: 0 };
  const { count } = await admin
    .from("user_two_factor_backup_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("used_at", null);
  return { configured, enabled: true, backupCodesRemaining: count ?? 0 };
}

async function markSessionVerified(userId: string, sessionId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("two_factor_session_verifications")
    .upsert({ clerk_session_id: sessionId, user_id: userId, verified_at: new Date().toISOString() }, { onConflict: "clerk_session_id" });
  if (error) {
    console.error("[2fa] não foi possível registrar a sessão verificada:", error.message);
    return false;
  }
  // limpeza oportunista (indexada): sessões antigas já expiraram no Clerk
  await admin.from("two_factor_session_verifications").delete().lt("verified_at", new Date(Date.now() - VERIFICATION_RETENTION_MS).toISOString());
  return true;
}

interface CheckOptions {
  /** Aceita código de backup além do código do app (login e desativação sim; confirmar a ativação não). */
  allowBackup: boolean;
  /** Exige que o segundo fator já esteja ativo (false = confirmação da ativação, ainda pendente). */
  requireEnabled: boolean;
}

/**
 * Confere um código digitado. Ordem importa para a segurança:
 *  1. formato inválido nem gasta tentativa (não há o que adivinhar);
 *  2. a tentativa é RESERVADA no banco (atômico) ANTES de conferir: no máximo 5 códigos por janela, mesmo em paralelo;
 *  3. código do app: precisa ser de um passo MAIOR que o último usado (mesmo código não vale duas vezes);
 *  4. código de backup: marca como usado numa única operação (dois pedidos simultâneos não usam o mesmo).
 * Acerto zera o contador de falhas.
 */
async function checkCode(userId: string, rawCode: string, options: CheckOptions): Promise<{ ok: true; kind: "totp" | "backup" } | TwoFactorFailure> {
  const k = keys();
  if (!k) return { ok: false, code: "not_configured" };

  const admin = createAdminClient();
  const { data: row, error: rowError } = await admin
    .from("user_two_factor")
    .select("secret_enc, enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (rowError) {
    console.error("[2fa] leitura falhou:", rowError.message);
    return { ok: false, code: "unavailable" };
  }
  if (!row) return { ok: false, code: "not_enabled" };
  if (options.requireEnabled && !row.enabled) return { ok: false, code: "not_enabled" };
  if (!options.requireEnabled && row.enabled) return { ok: false, code: "already_enabled" };

  const parsed = classifyCode(rawCode);
  if (parsed.kind === "invalid" || (parsed.kind === "backup" && !options.allowBackup)) return { ok: false, code: "invalid" };

  const { data: lockedUntil, error: reserveError } = await admin.rpc("two_factor_reserve_attempt", { p_user_id: userId });
  if (reserveError) {
    console.error("[2fa] reserva de tentativa falhou:", reserveError.message);
    return { ok: false, code: "unavailable" };
  }
  if (lockedUntil) return { ok: false, code: "locked", lockedUntil };

  const reset = { failed_attempts: 0, locked_until: null };

  if (parsed.kind === "totp") {
    const secret = decryptSecret(row.secret_enc, k, userId);
    if (!secret) {
      console.error("[2fa] não foi possível decifrar o segredo (chave trocada ou dado adulterado).");
      return { ok: false, code: "unavailable" };
    }
    const step = verifyTotp(secret, parsed.code, Date.now());
    if (step === null) return { ok: false, code: "invalid" };
    const { data: advanced, error } = await admin
      .from("user_two_factor")
      .update({ last_used_step: step, ...reset })
      .eq("user_id", userId)
      .lt("last_used_step", step)
      .select("user_id");
    if (error) return { ok: false, code: "unavailable" };
    if (!advanced || advanced.length === 0) return { ok: false, code: "invalid" }; // mesmo código (ou mais antigo) reutilizado
    return { ok: true, kind: "totp" };
  }

  const { data: used, error: usedError } = await admin
    .from("user_two_factor_backup_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("code_hash", hashBackupCode(parsed.code, k))
    .is("used_at", null)
    .select("id");
  if (usedError) return { ok: false, code: "unavailable" };
  if (!used || used.length === 0) return { ok: false, code: "invalid" };
  await admin.from("user_two_factor").update(reset).eq("user_id", userId);
  return { ok: true, kind: "backup" };
}

async function replaceBackupCodes(userId: string, k: TwoFactorKeys): Promise<string[] | null> {
  const admin = createAdminClient();
  const codes = generateBackupCodes(BACKUP_CODE_COUNT);
  const { error: deleteError } = await admin.from("user_two_factor_backup_codes").delete().eq("user_id", userId);
  if (deleteError) return null;
  const { error } = await admin
    .from("user_two_factor_backup_codes")
    .insert(codes.map((code) => ({ user_id: userId, code_hash: hashBackupCode(code, k) })));
  return error ? null : codes;
}

/** Começa a ativação: guarda um segredo novo (cifrado, ainda NÃO ativo) e devolve o que o app autenticador precisa. */
export async function beginSetup(userId: string, accountLabel: string): Promise<{ ok: true; secret: string; uri: string } | TwoFactorFailure> {
  const k = keys();
  if (!k) return { ok: false, code: "not_configured" };
  const admin = createAdminClient();

  const { data: existing, error: readError } = await admin.from("user_two_factor").select("enabled").eq("user_id", userId).maybeSingle();
  if (readError) return { ok: false, code: "unavailable" };
  if (existing?.enabled) return { ok: false, code: "already_enabled" };

  const secret = generateTotpSecret();
  const { error } = await admin.from("user_two_factor").upsert(
    {
      user_id: userId,
      secret_enc: encryptSecret(secret, k, userId),
      enabled: false,
      enabled_at: null,
      last_used_step: 0,
      failed_attempts: 0,
      locked_until: null,
    },
    { onConflict: "user_id" }
  );
  if (error) {
    console.error("[2fa] não foi possível iniciar a ativação:", error.message);
    return { ok: false, code: "unavailable" };
  }
  return { ok: true, secret, uri: buildOtpauthUri(secret, accountLabel) };
}

/** Confirma a ativação com o primeiro código do app. Devolve os códigos de backup UMA vez. */
export async function confirmSetup(userId: string, sessionId: string, code: string): Promise<{ ok: true; backupCodes: string[] } | TwoFactorFailure> {
  const k = keys();
  if (!k) return { ok: false, code: "not_configured" };
  const checked = await checkCode(userId, code, { allowBackup: false, requireEnabled: false });
  if (!checked.ok) return checked;

  const admin = createAdminClient();
  const { error } = await admin.from("user_two_factor").update({ enabled: true, enabled_at: new Date().toISOString() }).eq("user_id", userId);
  if (error) return { ok: false, code: "unavailable" };
  const backupCodes = await replaceBackupCodes(userId, k);
  if (!backupCodes) return { ok: false, code: "unavailable" };
  await markSessionVerified(userId, sessionId); // quem acabou de ativar não precisa digitar de novo nesta sessão
  return { ok: true, backupCodes };
}

/** Segunda etapa do login: confere o código e marca ESTA sessão do Clerk como verificada. */
export async function verifyForLogin(userId: string, sessionId: string, code: string): Promise<{ ok: true } | TwoFactorFailure> {
  const checked = await checkCode(userId, code, { allowBackup: true, requireEnabled: true });
  if (!checked.ok) return checked;
  const marked = await markSessionVerified(userId, sessionId);
  return marked ? { ok: true } : { ok: false, code: "unavailable" };
}

/** Desativa (exige um código válido, do app ou de backup). */
export async function disableTwoFactor(userId: string, code: string): Promise<{ ok: true } | TwoFactorFailure> {
  const checked = await checkCode(userId, code, { allowBackup: true, requireEnabled: true });
  if (!checked.ok) return checked;
  await purgeTwoFactor(userId);
  return { ok: true };
}

/** Gera códigos de backup novos (exige um código do APP, para não gastar um de backup à toa). */
export async function regenerateBackupCodes(userId: string, code: string): Promise<{ ok: true; backupCodes: string[] } | TwoFactorFailure> {
  const k = keys();
  if (!k) return { ok: false, code: "not_configured" };
  const checked = await checkCode(userId, code, { allowBackup: false, requireEnabled: true });
  if (!checked.ok) return checked;
  const backupCodes = await replaceBackupCodes(userId, k);
  return backupCodes ? { ok: true, backupCodes } : { ok: false, code: "unavailable" };
}

/** Apaga TUDO da segunda etapa deste usuário (desativação e exclusão da conta). */
export async function purgeTwoFactor(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("two_factor_session_verifications").delete().eq("user_id", userId);
  await admin.from("user_two_factor_backup_codes").delete().eq("user_id", userId);
  await admin.from("user_two_factor").delete().eq("user_id", userId);
}

/** O usuário já tem a segunda etapa ativa e ESTA sessão ainda não a cumpriu? (para a página de verificação) */
export async function readGateForPage(userId: string, sessionId: string): Promise<{ required: boolean; verified: boolean }> {
  const admin = createAdminClient();
  const { data: row } = await admin.from("user_two_factor").select("enabled").eq("user_id", userId).maybeSingle();
  if (!row?.enabled) return { required: false, verified: true };
  const { data: verification } = await admin
    .from("two_factor_session_verifications")
    .select("clerk_session_id")
    .eq("clerk_session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  return { required: true, verified: Boolean(verification) };
}
