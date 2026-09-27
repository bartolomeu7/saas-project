/**
 * Fase de preparação da migração para Clerk (auditoria completa em
 * docs/auth — ver mensagem da missão "PREPARAR PRIME GES PARA CLERK").
 *
 * O Supabase Auth ainda é a autenticação real do app; nada em
 * src/lib/auth/actions.ts foi removido ou alterado. Este módulo só
 * decide se a infraestrutura do Clerk (ClerkProvider, clerkMiddleware)
 * deve ligar — e ela só liga quando as chaves da instância Development
 * existirem no ambiente. Sem chaves, o app se comporta exatamente como
 * antes: zero risco de quebrar o fluxo atual em local/Preview/produção
 * enquanto o Clerk não estiver configurado.
 *
 * NUNCA usar em produção antes da Fase 4/5 (RLS/RPCs) ser aprovada e
 * concluída — a chave de produção do Clerk nem deve existir no projeto
 * ainda (ver regra da missão: "NÃO criar Clerk Production").
 */
export const CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

/** true somente quando a instância Development do Clerk está configurada. */
export const isClerkEnabled = CLERK_PUBLISHABLE_KEY.length > 0;
