"use server";

import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/auth/actions";
import {
  getPublishedLegalVersions,
  hasConsentHistory,
  recordMyConsent,
  safeAfterConsentPath,
  type PublishedLegalVersions,
} from "@/lib/legal/consent";
import {
  SIGNUP_INTENT_COOKIE,
  SIGNUP_INTENT_TTL_SECONDS,
  createSignupIntent,
  intentMatchesNewUser,
  verifySignupIntent,
} from "@/lib/legal/signup-intent";

const UNAVAILABLE = "Não foi possível verificar os documentos agora. Tente novamente em instantes.";

/**
 * Validação de servidor dos dois aceites. O navegador só envia "marquei" e as versões que viu;
 * quem decide é o servidor: os dois precisam estar marcados e as versões precisam ser as vigentes
 * (e o texto do repositório precisa ser o publicado). Qualquer falha devolve erro sem gravar nada.
 */
async function validateConsentForm(
  formData: FormData
): Promise<{ ok: true; versions: PublishedLegalVersions } | { ok: false; result: ActionResult }> {
  if (formData.get("terms") !== "on") {
    return {
      ok: false,
      result: { error: "Aceite os Termos de Uso para continuar.", field: "terms" },
    };
  }
  if (formData.get("privacy") !== "on") {
    return {
      ok: false,
      result: { error: "Confirme que leu a Política de Privacidade para continuar.", field: "privacy" },
    };
  }

  const versions = await getPublishedLegalVersions();
  if (!versions) return { ok: false, result: { error: UNAVAILABLE } };

  if (versions.integrity !== "OK") {
    return {
      ok: false,
      result: {
        error: "Os documentos estão em atualização. Tente novamente em alguns minutos.",
        code: "LEGAL_INTEGRITY",
      },
    };
  }

  if (
    formData.get("termsVersion") !== versions.terms.version ||
    formData.get("privacyVersion") !== versions.privacy.version
  ) {
    return {
      ok: false,
      result: {
        error: "Os documentos foram atualizados. Recarregue a página, leia a versão atual e aceite novamente.",
        code: "LEGAL_VERSION_CHANGED",
      },
    };
  }

  return { ok: true, versions };
}

/**
 * Cadastro: valida os dois aceites e emite o cookie assinado de intenção. Só com esse cookie a
 * tela de cadastro mostra o formulário do Clerk; depois o servidor o troca pelo registro
 * definitivo (ver /aceite-termos). Não cria conta nem grava no banco.
 */
export async function startSignupAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) return { error: UNAVAILABLE };

  const checked = await validateConsentForm(formData);
  if (!checked.ok) return checked.result;

  const jar = await cookies();
  jar.set(
    SIGNUP_INTENT_COOKIE,
    createSignupIntent(secret, {
      terms: checked.versions.terms.version,
      privacy: checked.versions.privacy.version,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SIGNUP_INTENT_TTL_SECONDS,
    }
  );

  redirect("/register");
}

/**
 * Aceite explícito (usuário existente sem consentimento vigente, ou cadastro feito em outro
 * navegador). Exige sessão: a RPC identifica o usuário pelo JWT e recusa qualquer outra coisa.
 */
export async function acceptLegalDocumentsAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const checked = await validateConsentForm(formData);
  if (!checked.ok) return checked.result;

  const context = (await hasConsentHistory()) ? "REACCEPTANCE" : "ACCEPTANCE_GATE";
  const saved = await recordMyConsent({
    termsVersion: checked.versions.terms.version,
    privacyVersion: checked.versions.privacy.version,
    context,
  });
  if (!saved.ok) {
    return { error: "Não foi possível registrar o aceite. Tente novamente.", code: "LEGAL_RECORD_FAILED" };
  }

  const next = safeAfterConsentPath(String(formData.get("next") ?? ""));
  redirect(next);
}

/**
 * Troca o cookie assinado de intenção (emitido no cadastro) pelo registro definitivo em
 * user_consents, com contexto SIGNUP. O servidor reconfere TUDO (a decisão da página não vale):
 * assinatura e validade do token, usuário recém-criado (criado depois da emissão do token),
 * texto do repositório = texto publicado e versões vigentes. Qualquer falha devolve erro e a
 * tela cai no aceite explícito. O cookie é descartado ao consumir (uso único).
 */
export async function confirmSignupConsentAction(next: string): Promise<ActionResult> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) return { error: UNAVAILABLE };

  const jar = await cookies();
  const intent = verifySignupIntent(secret, jar.get(SIGNUP_INTENT_COOKIE)?.value);
  if (!intent) return { error: "Confirme o aceite dos documentos para continuar.", code: "NO_INTENT" };

  const clerkUser = await currentUser();
  if (!clerkUser || !intentMatchesNewUser(intent, clerkUser.createdAt)) {
    return { error: "Confirme o aceite dos documentos para continuar.", code: "INTENT_NOT_FOR_USER" };
  }

  const versions = await getPublishedLegalVersions();
  if (
    !versions ||
    versions.integrity !== "OK" ||
    intent.terms !== versions.terms.version ||
    intent.privacy !== versions.privacy.version
  ) {
    return { error: "Os documentos foram atualizados. Leia e aceite novamente.", code: "LEGAL_VERSION_CHANGED" };
  }

  const saved = await recordMyConsent({
    termsVersion: versions.terms.version,
    privacyVersion: versions.privacy.version,
    context: "SIGNUP",
  });
  if (!saved.ok) return { error: "Não foi possível registrar o aceite. Tente novamente.", code: "LEGAL_RECORD_FAILED" };

  jar.delete(SIGNUP_INTENT_COOKIE);
  redirect(safeAfterConsentPath(next));
}
