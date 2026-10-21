-- Publica 1.0.0-rc.3 dos documentos legais (Termos de Uso e Política de Privacidade).
-- A rc.2 NÃO é editada: só passa de published para retired (a tabela proíbe qualquer outra mudança).
-- Todos os usuários passam a ter o aceite pendente e são levados a /aceite-termos no próximo acesso.
-- ORDEM DE PUBLICAÇÃO: aplicar esta migration e fazer o deploy do código da rc.3 em seguida (minutos): enquanto um
-- estiver sem o outro, o aceite fica bloqueado de propósito (integridade texto × banco).
-- Hashes = SHA-256 do JSON canônico (src/lib/legal/hash.ts); tests/unit/legal.test.mjs (T12) confere.
-- Os textos ainda têm marcadores [BLOCKED] de dados da empresa (decisão do dono: publicar assim e completar depois;
-- a próxima versão, rc.4, registra os dados definitivos).

update public.legal_document_versions
   set status = 'retired'
 where version = '1.0.0-rc.2' and status = 'published';

insert into public.legal_document_versions (document_type, version, effective_at, content_hash, status)
values
  ('TERMS_OF_USE', '1.0.0-rc.3', '2026-10-21T00:00:00-03:00', '744998c56f925fe1c4068620b4aaeb4fc10be84fee4cc3d7cf1704fc02e1f8b9', 'published'),
  ('PRIVACY_POLICY', '1.0.0-rc.3', '2026-10-21T00:00:00-03:00', '5aeb29bf9c46cfff309c74d0daf262a5cf025242050db9844eff427f17b6c2d8', 'published')
on conflict (document_type, version) do nothing;
