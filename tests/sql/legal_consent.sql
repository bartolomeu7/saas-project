-- =============================================================================
-- Bateria SQL do consentimento legal — roda SOMENTE no projeto TEST.
--
-- Tudo dentro de UMA transação que termina em erro proposital (RESULT: {json}): nada persiste.
-- Simula as sessões do Clerk pelo claim `sub` + `role=authenticated` (como o PostgREST faz com o
-- JWT do Clerk). Cria perfis fictícios e versões fictícias de documentos, tudo desfeito no fim.
-- O erro final carrega o resultado: totais por grupo e lista de falhas (vazia = tudo certo).
-- Como rodar: cole o arquivo inteiro no SQL do projeto TEST (ou execute_sql do MCP).
-- NÃO rode em Production.
-- =============================================================================
begin;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (user_id, clerk_user_id, full_name, email, role, status) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'cn_a', 'CN A', 'cn-a@example.invalid', 'user', 'active'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'cn_b', 'CN B', 'cn-b@example.invalid', 'user', 'active'),
  ('aaaaaaaa-0000-0000-0000-00000000000c', 'cn_susp', 'CN S', 'cn-s@example.invalid', 'user', 'active');
select set_config('app.platform_profile_write', 'on', true);
update public.profiles set status = 'suspended' where user_id = 'aaaaaaaa-0000-0000-0000-00000000000c';
select set_config('app.platform_profile_write', 'off', true);

create temp table r (n serial, grp text, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;

-- chk(grupo, rótulo, consulta que devolve 1 valor, esperado)
--   'OK' -> não deu erro | 'OK=valor' -> valor exato | 'OKLIKE=trecho' | 'ERR=trecho' -> erro contendo o trecho
create or replace function pg_temp.chk(g text, l text, q text, e text) returns void language plpgsql as $$
declare v text; got text; pass boolean;
begin
  begin
    execute q into v;
    got := 'OK=' || coalesce(v, 'null');
  exception when others then
    got := 'ERR=' || sqlerrm;
  end;
  pass := case
    when e = 'OK' then got like 'OK=%'
    when e like 'OKLIKE=%' then got like 'OK=%' and position(substr(e, 8) in got) > 0
    when e like 'OK=%' then got = e
    when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0
    else false end;
  insert into r(grp, label, expect, got, ok) values (g, l, e, left(got, 200), pass);
end $$;
grant execute on function pg_temp.chk(text, text, text, text) to authenticated, anon;

-- ============================================================ ESTRUTURA (como dono do banco)
select pg_temp.chk('schema', 'RLS ligada nas duas tabelas', $q$select count(*)::text from pg_class where relnamespace = 'public'::regnamespace and relname in ('legal_document_versions','user_consents') and relrowsecurity$q$, 'OK=2');
select pg_temp.chk('schema', 'nenhuma policy nas tabelas novas', $q$select count(*)::text from pg_policies where schemaname = 'public' and tablename in ('legal_document_versions','user_consents')$q$, 'OK=0');
select pg_temp.chk('schema', 'anon/authenticated sem grant direto nas tabelas', $q$select count(*)::text from information_schema.role_table_grants where table_schema = 'public' and table_name in ('legal_document_versions','user_consents') and grantee in ('anon','authenticated')$q$, 'OK=0');
select pg_temp.chk('schema', 'trigger de TRUNCATE existe', $q$select count(*)::text from pg_trigger where tgrelid = 'public.user_consents'::regclass and not tgisinternal and (tgtype & 32) = 32$q$, 'OK=1');
select pg_temp.chk('schema', 'seed: duas versões vigentes', $q$select count(*)::text from public.get_current_legal_documents()$q$, 'OK=2');
select pg_temp.chk('schema', 'hash do seed é SHA-256 (64 hex)', $q$select count(*)::text from public.legal_document_versions where content_hash ~ '^[0-9a-f]{64}$'$q$, 'OKLIKE=');

-- ============================================================ ANON
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('anon', 'anon lê as versões vigentes (informação pública)', $q$select count(*)::text from public.get_current_legal_documents()$q$, 'OK=2');
select pg_temp.chk('anon', 'anon NÃO registra consentimento', $q$select public.record_legal_consent('1.0.0-rc.1','1.0.0-rc.1','SIGNUP')::text$q$, 'ERR=permission denied');
select pg_temp.chk('anon', 'anon NÃO vê status', $q$select public.get_my_legal_consent_status()::text$q$, 'ERR=permission denied');
select pg_temp.chk('anon', 'anon NÃO vê histórico', $q$select count(*)::text from public.get_my_legal_consent_history()$q$, 'ERR=permission denied');
select pg_temp.chk('anon', 'anon NÃO lê user_consents', $q$select count(*)::text from public.user_consents$q$, 'ERR=permission denied');
select pg_temp.chk('anon', 'anon NÃO lê legal_document_versions direto', $q$select count(*)::text from public.legal_document_versions$q$, 'ERR=permission denied');

-- ============================================================ USUÁRIO A (ativo, sem consentimento)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cn_a","role":"authenticated"}', true);
select pg_temp.chk('gate', 'T08 usuário sem consentimento: status incompleto', $q$select (public.get_my_legal_consent_status()->>'complete')$q$, 'OK=false');
select pg_temp.chk('gate', 'T08 pendências = 2 documentos', $q$select jsonb_array_length(public.get_my_legal_consent_status()->'pending')::text$q$, 'OK=2');
select pg_temp.chk('record', 'T05 versão inválida dos Termos é rejeitada', $q$select public.record_legal_consent('9.9.9','1.0.0-rc.1','SIGNUP')::text$q$, 'ERR=versão dos documentos mudou');
select pg_temp.chk('record', 'T05 versão inválida da Política é rejeitada', $q$select public.record_legal_consent('1.0.0-rc.1','0.0.1','SIGNUP')::text$q$, 'ERR=versão dos documentos mudou');
select pg_temp.chk('record', 'versão nula é rejeitada', $q$select public.record_legal_consent(null,null,'SIGNUP')::text$q$, 'ERR=versão dos documentos mudou');
select pg_temp.chk('record', 'contexto inválido é rejeitado', $q$select public.record_legal_consent('1.0.0-rc.1','1.0.0-rc.1','HACK')::text$q$, 'ERR=Contexto de aceite inválido');
select pg_temp.chk('record', 'nada foi gravado pelas tentativas inválidas', $q$select jsonb_array_length(public.get_my_legal_consent_status()->'pending')::text$q$, 'OK=2');
select pg_temp.chk('record', 'T04 aceite válido grava os dois documentos', $q$select (public.record_legal_consent('1.0.0-rc.1','1.0.0-rc.1','SIGNUP')->>'recorded')$q$, 'OK=2');
select pg_temp.chk('gate', 'T09 com consentimento vigente: status completo', $q$select (public.get_my_legal_consent_status()->>'complete')$q$, 'OK=true');
select pg_temp.chk('record', 'repetir o aceite é idempotente (0 novos)', $q$select (public.record_legal_consent('1.0.0-rc.1','1.0.0-rc.1','ACCEPTANCE_GATE')->>'recorded')$q$, 'OK=0');
select pg_temp.chk('history', 'histórico tem exatamente 2 registros', $q$select count(*)::text from public.get_my_legal_consent_history()$q$, 'OK=2');
select pg_temp.chk('history', 'tipos separados: aceite dos Termos e ciência da Política', $q$select string_agg(consent_type, ',' order by consent_type) from public.get_my_legal_consent_history()$q$, 'OK=PRIVACY_POLICY_ACKNOWLEDGEMENT,TERMS_OF_USE_ACCEPTANCE');
select pg_temp.chk('history', 'contexto registrado = SIGNUP', $q$select string_agg(distinct context, ',') from public.get_my_legal_consent_history()$q$, 'OK=SIGNUP');
select pg_temp.chk('history', 'T12 hash do aceite = hash da versão publicada', $q$select count(*)::text from public.get_my_legal_consent_history() h join public.get_current_legal_documents() d on d.document_type = h.document_type and d.version = h.version and d.content_hash = h.document_hash$q$, 'OK=2');

-- manipulação direta (T07 / T13): nada passa por fora das RPCs
select pg_temp.chk('bypass', 'T13 INSERT direto em user_consents é negado', $q$insert into public.user_consents(user_id, consent_type, document_type, document_version_id, document_hash, context) select 'aaaaaaaa-0000-0000-0000-00000000000b', 'TERMS_OF_USE_ACCEPTANCE', 'TERMS_OF_USE', id, content_hash, 'SIGNUP' from public.legal_document_versions limit 1 returning 'inserido'$q$, 'ERR=permission denied');
select pg_temp.chk('bypass', 'T13 UPDATE direto em user_consents é negado', $q$update public.user_consents set granted = false returning 'x'$q$, 'ERR=permission denied');
select pg_temp.chk('bypass', 'T13 DELETE direto em user_consents é negado', $q$delete from public.user_consents returning 'x'$q$, 'ERR=permission denied');
select pg_temp.chk('bypass', 'T13 UPDATE em versão publicada é negado', $q$update public.legal_document_versions set content_hash = repeat('0', 64) returning 'x'$q$, 'ERR=permission denied');
select pg_temp.chk('bypass', 'T07 a RPC não aceita user_id (assinatura só tem versões e contexto)', $q$select count(*)::text from pg_proc where proname = 'record_legal_consent' and pronargs = 3 and proargnames = array['p_terms_version','p_privacy_version','p_context']$q$, 'OK=1');

-- ============================================================ USUÁRIO B (isolamento)
select set_config('request.jwt.claims', '{"sub":"cn_b","role":"authenticated"}', true);
select pg_temp.chk('isolation', 'B não vê o histórico de A', $q$select count(*)::text from public.get_my_legal_consent_history()$q$, 'OK=0');
select pg_temp.chk('isolation', 'B continua pendente mesmo com A em dia', $q$select (public.get_my_legal_consent_status()->>'complete')$q$, 'OK=false');

-- ============================================================ SUSPENSO e DESCONHECIDO
select set_config('request.jwt.claims', '{"sub":"cn_susp","role":"authenticated"}', true);
select pg_temp.chk('identity', 'perfil suspenso não registra consentimento', $q$select public.record_legal_consent('1.0.0-rc.1','1.0.0-rc.1','SIGNUP')::text$q$, 'ERR=not authenticated');
select set_config('request.jwt.claims', '{"sub":"cn_inexistente","role":"authenticated"}', true);
select pg_temp.chk('identity', 'identidade sem perfil não registra consentimento', $q$select public.record_legal_consent('1.0.0-rc.1','1.0.0-rc.1','SIGNUP')::text$q$, 'ERR=not authenticated');
select pg_temp.chk('identity', 'identidade sem perfil não vê status', $q$select public.get_my_legal_consent_status()::text$q$, 'ERR=not authenticated');

-- ============================================================ IMUTABILIDADE (como dono do banco)
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select pg_temp.chk('immutable', 'user_consents: UPDATE é bloqueado até para o dono', $q$update public.user_consents set granted = false returning 'x'$q$, 'ERR=append-only');
select pg_temp.chk('immutable', 'user_consents: DELETE é bloqueado até para o dono', $q$delete from public.user_consents returning 'x'$q$, 'ERR=append-only');
select pg_temp.chk('immutable', 'user_consents: TRUNCATE é bloqueado', $q$truncate public.user_consents$q$, 'ERR=append-only');
select pg_temp.chk('immutable', 'versão publicada: não muda o hash', $q$update public.legal_document_versions set content_hash = repeat('0', 64) where document_type = 'TERMS_OF_USE' returning 'x'$q$, 'ERR=imutável');
select pg_temp.chk('immutable', 'versão publicada: não muda o número da versão', $q$update public.legal_document_versions set version = 'X' where document_type = 'TERMS_OF_USE' returning 'x'$q$, 'ERR=imutável');
select pg_temp.chk('immutable', 'versão publicada: não pode ser apagada', $q$delete from public.legal_document_versions where document_type = 'TERMS_OF_USE' returning 'x'$q$, 'ERR=não pode ser apagada');
select pg_temp.chk('immutable', 'T14 não existe consentimento de marketing no modelo (constraint)', $q$insert into public.user_consents(user_id, consent_type, document_type, document_version_id, document_hash, context) select 'aaaaaaaa-0000-0000-0000-00000000000a', 'MARKETING_CONSENT', 'TERMS_OF_USE', id, content_hash, 'SIGNUP' from public.legal_document_versions limit 1$q$, 'ERR=user_consents_consent_type_check');
select pg_temp.chk('immutable', 'tipo de aceite deve casar com o documento (constraint)', $q$insert into public.user_consents(user_id, consent_type, document_type, document_version_id, document_hash, context) select 'aaaaaaaa-0000-0000-0000-00000000000a', 'TERMS_OF_USE_ACCEPTANCE', 'PRIVACY_POLICY', id, content_hash, 'SIGNUP' from public.legal_document_versions where document_type = 'PRIVACY_POLICY' limit 1$q$, 'ERR=user_consents_type_matches_document');

-- ============================================================ NOVA VERSÃO (T06 / T10 / T11)
-- versão futura NÃO é vigente (T06): publicada com vigência no futuro
insert into public.legal_document_versions (document_type, version, effective_at, content_hash, status)
  values ('TERMS_OF_USE', '2.0.0-fut', now() + interval '30 days', repeat('a', 64), 'published');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cn_a","role":"authenticated"}', true);
select pg_temp.chk('version', 'T06 documento não vigente (futuro) é rejeitado', $q$select public.record_legal_consent('2.0.0-fut','1.0.0-rc.1','REACCEPTANCE')::text$q$, 'ERR=versão dos documentos mudou');
select pg_temp.chk('version', 'versão futura não muda o status atual', $q$select (public.get_my_legal_consent_status()->>'complete')$q$, 'OK=true');

-- nova versão material já em vigor (T10): a anterior é aposentada, a nova passa a ser a vigente
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.legal_document_versions set status = 'retired' where document_type = 'TERMS_OF_USE' and version = '1.0.0-rc.1';
insert into public.legal_document_versions (document_type, version, effective_at, content_hash, status)
  values ('TERMS_OF_USE', '1.1.0-test', now() - interval '1 minute', repeat('b', 64), 'published');
select pg_temp.chk('version', 'aposentar versão publicada é permitido (published -> retired)', $q$select count(*)::text from public.legal_document_versions where document_type = 'TERMS_OF_USE' and version = '1.0.0-rc.1' and status = 'retired'$q$, 'OK=1');
select pg_temp.chk('version', 'versão aposentada não volta a published', $q$update public.legal_document_versions set status = 'published' where document_type = 'TERMS_OF_USE' and version = '1.0.0-rc.1' returning 'x'$q$, 'ERR=Transição de status inválida');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cn_a","role":"authenticated"}', true);
select pg_temp.chk('version', 'T10 nova versão vigente: usuário afetado fica pendente', $q$select (public.get_my_legal_consent_status()->>'complete')$q$, 'OK=false');
select pg_temp.chk('version', 'T10 só os Termos estão pendentes (a Política não mudou)', $q$select public.get_my_legal_consent_status()->'pending'->0->>'document_type'$q$, 'OK=TERMS_OF_USE');
select pg_temp.chk('version', 'T06 versão aposentada é rejeitada (hash/versão velhos)', $q$select public.record_legal_consent('1.0.0-rc.1','1.0.0-rc.1','REACCEPTANCE')::text$q$, 'ERR=versão dos documentos mudou');
select pg_temp.chk('version', 'T10 reaceite grava apenas o documento novo', $q$select (public.record_legal_consent('1.1.0-test','1.0.0-rc.1','REACCEPTANCE')->>'recorded')$q$, 'OK=1');
select pg_temp.chk('version', 'depois do reaceite o status volta a completo', $q$select (public.get_my_legal_consent_status()->>'complete')$q$, 'OK=true');
select pg_temp.chk('version', 'T11 histórico anterior permanece (3 registros)', $q$select count(*)::text from public.get_my_legal_consent_history()$q$, 'OK=3');
select pg_temp.chk('version', 'T11 o aceite antigo continua apontando a versão antiga', $q$select count(*)::text from public.get_my_legal_consent_history() where document_type = 'TERMS_OF_USE' and version = '1.0.0-rc.1'$q$, 'OK=1');
select pg_temp.chk('version', 'T12 hash do reaceite = hash da nova versão', $q$select count(*)::text from public.get_my_legal_consent_history() where version = '1.1.0-test' and document_hash = repeat('b', 64)$q$, 'OK=1');

-- ================================================================ RESULTADO (erro proposital: reverte tudo)
reset role;
do $result$
declare v jsonb;
begin
  select jsonb_build_object(
    'total', count(*),
    'pass', count(*) filter (where ok),
    'fail', count(*) filter (where not ok),
    'por_grupo', (select jsonb_object_agg(grp, jsonb_build_object('pass', p, 'fail', f)) from (select grp, count(*) filter (where ok) p, count(*) filter (where not ok) f from r group by grp) g),
    'falhas', coalesce((select jsonb_agg(jsonb_build_object('grupo', grp, 'teste', label, 'esperado', expect, 'obtido', got) order by n) from r where not ok), '[]'::jsonb)
  ) into v from r;
  raise exception 'RESULT: %', v::text;
end
$result$;
