-- Publica 1.0.0-rc.4 dos documentos legais (Termos de Uso e Política de Privacidade).
-- A rc.3 NÃO é editada: só passa de published para retired (a tabela proíbe qualquer outra mudança).
-- Todos os usuários passam a ter o aceite pendente e são levados a /aceite-termos no próximo acesso.
-- ORDEM DE PUBLICAÇÃO: aplicar esta migration e fazer o deploy do código da rc.4 em seguida (minutos): enquanto um
-- estiver sem o outro, o aceite fica bloqueado de propósito (integridade texto × banco).
-- Hashes = SHA-256 do JSON canônico (src/lib/legal/hash.ts); tests/unit/legal.test.mjs (T12) confere.
-- Mudanças: identificação provisória (Nexora Group) e canal de contato, prestadores atuais, assistente de agenda,
-- dados de equipe/RH, medição de acessos, prazos e cláusulas de operador.
-- SEM arquivo de volta, de propósito: versão publicada não pode ser apagada nem voltar de "retired", e aposentar a
-- rc.4 deixaria o sistema sem documento vigente. Para voltar o texto, publique uma rc.5 em nova migration.

update public.legal_document_versions
   set status = 'retired'
 where version = '1.0.0-rc.3' and status = 'published';

insert into public.legal_document_versions (document_type, version, effective_at, content_hash, status)
values
  ('TERMS_OF_USE', '1.0.0-rc.4', '2026-11-25T00:00:00-03:00', 'a8689c58edf09eed45d73aa21c02edd49a6e4f64d17a771c9e447fb5eecff3bf', 'published'),
  ('PRIVACY_POLICY', '1.0.0-rc.4', '2026-11-25T00:00:00-03:00', '93fc9f74fe1ada4cc6891c1d275512da5cfcdd6228c99dbe28231fdee6cbc898', 'published')
on conflict (document_type, version) do nothing;
