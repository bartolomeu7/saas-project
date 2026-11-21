-- =============================================================================
-- Bateria SQL do estilo do orçamento (20261121210000_quote_style) — TEST/local.
-- Tudo dentro de UMA transação com ROLLBACK: nada persiste. Rode DEPOIS de a migration estar aplicada
-- (ou concatene o corpo da migration antes, sem begin/commit/notify).
-- =============================================================================
begin;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temp table actors as
  select (select cm.user_id from public.company_members cm where cm.company_id = '1742f32b-c457-4377-9f8f-16a05f279d94' and cm.role = 'owner' limit 1) as owner_id,
         (select p.user_id from public.profiles p where p.role = 'user' and p.status = 'active'
            and not exists (select 1 from public.company_members m where m.user_id = p.user_id and m.company_id = '1742f32b-c457-4377-9f8f-16a05f279d94')
          order by p.created_at limit 1) as outsider_id;
update public.profiles set clerk_user_id = 'qs_owner' where user_id = (select owner_id from actors);
update public.profiles set clerk_user_id = 'qs_out' where user_id = (select outsider_id from actors);

create temp table r (n serial, label text, expect text, got text, ok boolean);
grant all on r to authenticated, anon;
grant all on sequence r_n_seq to authenticated, anon;

create or replace function pg_temp.chk(l text, q text, e text) returns void language plpgsql as $$
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
    when e like 'OK=%' then got = e
    when e like 'ERR=%' then got like 'ERR=%' and position(substr(e, 5) in got) > 0
    else false end;
  insert into r(label, expect, got, ok) values (l, e, left(got, 160), pass);
end $$;
grant execute on function pg_temp.chk(text, text, text) to authenticated, anon;

-- ================================================================ acesso
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('anon NÃO altera o estilo', $$select public.update_company_quote_style('modern','#112233','oi',null,null,true)$$, 'ERR=permission denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"qs_out"}', true);
select pg_temp.chk('quem é de OUTRA empresa só mexe na empresa dele', $$select 'ok' from (select public.update_company_quote_style('classic','#ff0000','de fora',null,null,true)) t$$, 'OK=ok');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"qs_owner"}', true);

-- ================================================================ salvar
select pg_temp.chk('o estilo da empresa de teste NÃO foi tocado pelo de fora', $$select (operational_preferences ? 'quote_style')::text from public.company_settings where company_id='1742f32b-c457-4377-9f8f-16a05f279d94'$$, 'OK=false');
select pg_temp.chk('dono salva o estilo', $$select 'ok' from (select public.update_company_quote_style('classic','#0F766E','Olá, {cliente}!','529.982.247-25','Oficina do Zé',false)) t$$, 'OK=ok');
select pg_temp.chk('modelo gravado', $$select operational_preferences->'quote_style'->>'template' from public.company_settings where company_id='1742f32b-c457-4377-9f8f-16a05f279d94'$$, 'OK=classic');
select pg_temp.chk('cor gravada em minúsculas', $$select operational_preferences->'quote_style'->>'brand_color' from public.company_settings where company_id='1742f32b-c457-4377-9f8f-16a05f279d94'$$, 'OK=#0f766e');
select pg_temp.chk('texto gravado', $$select operational_preferences->'quote_style'->>'intro_text' from public.company_settings where company_id='1742f32b-c457-4377-9f8f-16a05f279d94'$$, 'OK=Olá, {cliente}!');
select pg_temp.chk('aceite desligado gravado', $$select operational_preferences->'quote_style'->>'show_acceptance' from public.company_settings where company_id='1742f32b-c457-4377-9f8f-16a05f279d94'$$, 'OK=false');
select pg_temp.chk('Pix gravado', $$select operational_preferences->'quote_style'->>'pix_key' from public.company_settings where company_id='1742f32b-c457-4377-9f8f-16a05f279d94'$$, 'OK=529.982.247-25');

-- não apaga os padrões do orçamento (chave "quote")
select pg_temp.chk('salva os padrões do orçamento (chave quote)', $$select 'ok' from (select public.update_company_quote_defaults(20,'50% entrada','rodapé')) t$$, 'OK=ok');
select pg_temp.chk('os padrões NÃO apagaram o estilo', $$select operational_preferences->'quote_style'->>'template' from public.company_settings where company_id='1742f32b-c457-4377-9f8f-16a05f279d94'$$, 'OK=classic');
select pg_temp.chk('salva o estilo de novo', $$select 'ok' from (select public.update_company_quote_style('modern','#112233','',null,null,true)) t$$, 'OK=ok');
select pg_temp.chk('o estilo NÃO apagou os padrões do orçamento', $$select operational_preferences->'quote'->>'validity_days' from public.company_settings where company_id='1742f32b-c457-4377-9f8f-16a05f279d94'$$, 'OK=20');
select pg_temp.chk('texto vazio é aceito (sem apresentação)', $$select operational_preferences->'quote_style'->>'intro_text' from public.company_settings where company_id='1742f32b-c457-4377-9f8f-16a05f279d94'$$, 'OK=');
select pg_temp.chk('Pix vazio vira nulo', $$select coalesce(operational_preferences->'quote_style'->>'pix_key','NULO') from public.company_settings where company_id='1742f32b-c457-4377-9f8f-16a05f279d94'$$, 'OK=NULO');

-- ================================================================ validações
select pg_temp.chk('modelo inválido', $$select public.update_company_quote_style('ouro','#112233','',null,null,true)$$, 'ERR=Modelo de orçamento inválido');
select pg_temp.chk('cor inválida (sem #)', $$select public.update_company_quote_style('modern','112233','',null,null,true)$$, 'ERR=Cor da marca inválida');
select pg_temp.chk('cor inválida (nome)', $$select public.update_company_quote_style('modern','red','',null,null,true)$$, 'ERR=Cor da marca inválida');
select pg_temp.chk('cor inválida (injeção)', $$select public.update_company_quote_style('modern','#11223; drop','',null,null,true)$$, 'ERR=Cor da marca inválida');
select pg_temp.chk('texto grande demais', $$select public.update_company_quote_style('modern','#112233',repeat('a',601),null,null,true)$$, 'ERR=no máximo 600');
select pg_temp.chk('texto de 600 caracteres passa', $$select 'ok' from (select public.update_company_quote_style('modern','#112233',repeat('a',600),null,null,true)) t$$, 'OK=ok');
select pg_temp.chk('chave Pix com caractere estranho', $$select public.update_company_quote_style('modern','#112233','','abc def',null,true)$$, 'ERR=Chave Pix inválida');
select pg_temp.chk('chave Pix com aspas', $$select public.update_company_quote_style('modern','#112233','','a''b',null,true)$$, 'ERR=Chave Pix inválida');
select pg_temp.chk('chave Pix longa demais', $$select public.update_company_quote_style('modern','#112233','',repeat('a',78),null,true)$$, 'ERR=Chave Pix inválida');
select pg_temp.chk('e-mail como chave Pix passa', $$select 'ok' from (select public.update_company_quote_style('modern','#112233','','fulano+pix@exemplo.com.br',null,true)) t$$, 'OK=ok');
select pg_temp.chk('nome do recebedor grande demais', $$select public.update_company_quote_style('modern','#112233','',null,repeat('a',26),true)$$, 'ERR=no máximo 25');
select pg_temp.chk('aceite nulo recusado', $$select public.update_company_quote_style('modern','#112233','',null,null,null)$$, 'ERR=bloco de aceite');

-- ================================================================ auditoria
select pg_temp.chk('auditoria registra a alteração', $$select count(*)::text from public.audit_logs where action='company.quote_style_updated' and company_id='1742f32b-c457-4377-9f8f-16a05f279d94'$$, 'OK=4');
select pg_temp.chk('auditoria NÃO guarda a chave Pix', $$select count(*)::text from public.audit_logs where action='company.quote_style_updated' and metadata::text like '%529.982%'$$, 'OK=0');
reset role;

-- funcionário (não dono/admin) não altera
update public.company_members set role = 'employee' where user_id = (select owner_id from actors) and company_id = '1742f32b-c457-4377-9f8f-16a05f279d94';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"qs_owner"}', true);
select pg_temp.chk('funcionário NÃO altera o estilo', $$select public.update_company_quote_style('modern','#112233','',null,null,true)$$, 'ERR=Apenas o proprietário');
reset role;

-- ================================================================ resultado
select n, label, expect, got, ok from r where not ok order by n;
select count(*) filter (where ok) as passou, count(*) filter (where not ok) as falhou, count(*) as total from r;

rollback;
