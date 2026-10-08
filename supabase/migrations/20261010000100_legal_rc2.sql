-- Publica 1.0.0-rc.2 dos documentos legais (somente TEST: exercita o fluxo de reaceite).
-- Mesmo texto da rc.1; muda apenas o rótulo da versão, o que gera novo hash e torna o aceite
-- anterior pendente. A linha rc.1 NÃO é editada: só passa de published para retired.
-- Hashes = SHA-256 do JSON canônico (src/lib/legal/hash.ts); tests/unit/legal.test.mjs confere.

update public.legal_document_versions
   set status = 'retired'
 where version = '1.0.0-rc.1' and status = 'published';

insert into public.legal_document_versions (document_type, version, effective_at, content_hash, status)
values
  ('TERMS_OF_USE', '1.0.0-rc.2', '2026-10-08T00:00:00-03:00', '62ade40650d70b490835e8eebc94917eca7554b733cf91d2e9096400cba9cb69', 'published'),
  ('PRIVACY_POLICY', '1.0.0-rc.2', '2026-10-08T00:00:00-03:00', 'd43afbdf5a04c5f3258ad394b6a6824758f6f00860d0729cfbd67a756ced3bc9', 'published')
on conflict (document_type, version) do nothing;
