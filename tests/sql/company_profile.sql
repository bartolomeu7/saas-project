-- =============================================================================
-- Bateria SQL da Fase 0 do Orçamento (20261121100000_company_profile_logo_quote_defaults) — TEST/local.
-- Tudo dentro de UMA transação com ROLLBACK: nada persiste. Rode DEPOIS de a migration estar aplicada
-- (ou concatene o corpo da migration antes, sem begin/commit).
-- =============================================================================
begin;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- atores: dono da empresa de teste (teste1), um usuário de OUTRA empresa e um funcionário criado só dentro da transação
create temp table actors as
  select (select cm.user_id from public.company_members cm where cm.company_id = '1742f32b-c457-4377-9f8f-16a05f279d94' and cm.role = 'owner' limit 1) as owner_id,
         (select p.user_id from public.profiles p where p.role = 'user' and p.status = 'active'
            and not exists (select 1 from public.company_members m where m.user_id = p.user_id and m.company_id = '1742f32b-c457-4377-9f8f-16a05f279d94')
          order by p.created_at limit 1) as outsider_id,
         (select p.user_id from public.profiles p where p.role = 'user' and p.status = 'active'
            and not exists (select 1 from public.company_members m where m.user_id = p.user_id)
          order by p.created_at limit 1) as employee_id;
update public.profiles set clerk_user_id = 'cp_owner' where user_id = (select owner_id from actors);
update public.profiles set clerk_user_id = 'cp_out' where user_id = (select outsider_id from actors);
-- funcionário: se não houver perfil livre, usa o "de fora" como funcionário da empresa de teste
-- (a trava de vagas do plano barraria o funcionário de teste; é desligada só dentro desta transação, que termina em ROLLBACK)
alter table public.company_members disable trigger company_members_seat_limit;
delete from public.company_members where user_id = (select coalesce(employee_id, outsider_id) from actors) and company_id <> '1742f32b-c457-4377-9f8f-16a05f279d94';
insert into public.company_members (company_id, user_id, role)
  select '1742f32b-c457-4377-9f8f-16a05f279d94', coalesce(employee_id, outsider_id), 'employee' from actors
  on conflict do nothing;
update public.profiles set clerk_user_id = 'cp_emp' where user_id = (select coalesce(employee_id, outsider_id) from actors);

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
  insert into r(label, expect, got, ok) values (l, e, left(got, 140), pass);
end $$;
grant execute on function pg_temp.chk(text, text, text) to authenticated, anon;

-- imagem de teste: assinatura PNG + enchimento (120 bytes); o banco confere a assinatura, o tamanho e o alfabeto base64
create temp table png as select replace(encode('\x89504e470d0a1a0a'::bytea || decode(repeat('00', 112), 'hex'), 'base64'), chr(10), '') as b64;
grant all on png to authenticated, anon;

-- ================================================================ acesso
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('anon NÃO edita dados', $$select public.update_company_profile('X','','','','','','','','','','','','')$$, 'ERR=permission denied');
select pg_temp.chk('anon NÃO lê logos', $$select count(*) from public.company_logos$$, 'ERR=permission denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"cp_out"}', true);
select pg_temp.chk('usuário de outra empresa NÃO edita a empresa de teste (edita a própria ou fica sem empresa)', $$select public.update_company_profile('Intruso','','','','','','','','','','','','')::text is null$$, 'ERR=');
select pg_temp.chk('de fora: não grava logo', format($$select public.set_company_logo('image/png', %L)$$, (select b64 from png)), 'ERR=');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"cp_emp"}', true);
select pg_temp.chk('funcionário NÃO edita dados cadastrais', $$select public.update_company_profile('Func','','','','','','','','','','','','')$$, 'ERR=Apenas o proprietário ou um administrador');
select pg_temp.chk('funcionário NÃO grava logo', format($$select public.set_company_logo('image/png', %L)$$, (select b64 from png)), 'ERR=Apenas o proprietário');
select pg_temp.chk('funcionário NÃO muda padrões do orçamento', $$select public.update_company_quote_defaults(15, 'x', 'y')$$, 'ERR=Apenas o proprietário');
reset role;

-- ================================================================ dono: dados cadastrais
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"cp_owner"}', true);
select pg_temp.chk('dono grava dados completos', $$select 'ok' from (select public.update_company_profile('Empresa Teste LTDA','11.222.333/0001-81','(11) 3333-4444','(11) 98888-7777','CONTATO@Empresa.COM','https://empresa.com.br','01001-000','Rua A','100','Sala 2','Centro','São Paulo','sp')) t$$, 'OK=ok');
select pg_temp.chk('e-mail inválido', $$select public.update_company_profile('E','','','','a@b','','','','','','','','')$$, 'ERR=e-mail válido');
select pg_temp.chk('UF inválida', $$select public.update_company_profile('E','','','','','','','','','','','','XX')$$, 'ERR=UF inválida');
select pg_temp.chk('CEP inválido', $$select public.update_company_profile('E','','','','','','123','','','','','','')$$, 'ERR=CEP inválido');
select pg_temp.chk('site sem http', $$select public.update_company_profile('E','','','','','empresa.com.br','','','','','','','')$$, 'ERR=http');
select pg_temp.chk('site com javascript:', $$select public.update_company_profile('E','','','','','javascript:alert(1)','','','','','','','')$$, 'ERR=http');
select pg_temp.chk('razão social 181', $$select public.update_company_profile(repeat('a', 181),'','','','','','','','','','','','')$$, 'ERR=companies_profile_lengths');
select pg_temp.chk('endereço 201', $$select public.update_company_profile('E','','','','','','',repeat('a', 201),'','','','','')$$, 'ERR=companies_profile_lengths');
reset role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into r(label, expect, got, ok)
  select 'dados gravados normalizados (UF maiúscula, e-mail minúsculo)', 'SP|contato@empresa.com',
         (select state || '|' || email from public.companies where id = '1742f32b-c457-4377-9f8f-16a05f279d94'),
         (select state = 'SP' and email = 'contato@empresa.com' from public.companies where id = '1742f32b-c457-4377-9f8f-16a05f279d94');

-- ================================================================ dono: logo
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"cp_owner"}', true);
select pg_temp.chk('logo PNG válido', format($$select public.set_company_logo('image/png', %L)$$, (select b64 from png)), 'OK');
select pg_temp.chk('logo: conteudo que nao e PNG (tipo declarado PNG)', $$select public.set_company_logo('image/png', replace(encode(decode(repeat('41', 120), 'hex'), 'base64'), chr(10), ''))$$, 'ERR=uma imagem PNG');
select pg_temp.chk('logo: tipo SVG recusado', format($$select public.set_company_logo('image/svg+xml', %L)$$, (select b64 from png)), 'ERR=PNG, JPG ou WEBP');
select pg_temp.chk('logo: texto que não é base64', $$select public.set_company_logo('image/png', '<svg onload=alert(1)>')$$, 'ERR=Imagem inválida');
select pg_temp.chk('logo: grande demais (>512 KB)', $$select public.set_company_logo('image/png', repeat('A', 720004))$$, 'ERR=Imagem inválida');
select pg_temp.chk('logo: minúsculo (<100 bytes)', $$select public.set_company_logo('image/png', 'AAAA')$$, 'ERR=Imagem inválida');
select pg_temp.chk('dono lê o próprio logo (RLS)', $$select count(*)::text from public.company_logos$$, 'OK=1');
select pg_temp.chk('dono NÃO grava direto na tabela', $$update public.company_logos set content_type = 'image/png'$$, 'ERR=permission denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"cp_emp"}', true);
select pg_temp.chk('funcionário lê o logo da própria empresa (para o PDF)', $$select count(*)::text from public.company_logos$$, 'OK=1');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"cp_out"}', true);
select pg_temp.chk('de fora NÃO vê o logo da empresa de teste', $$select count(*)::text from public.company_logos where company_id = '1742f32b-c457-4377-9f8f-16a05f279d94'$$, 'OK=0');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"cp_owner"}', true);
select pg_temp.chk('remover logo', $$select 'ok' from (select public.remove_company_logo()) t$$, 'OK=ok');
select pg_temp.chk('logo removido', $$select count(*)::text from public.company_logos$$, 'OK=0');

-- ================================================================ padrões do orçamento
select pg_temp.chk('padrões válidos', $$select 'ok' from (select public.update_company_quote_defaults(20, 'Entrada de 50% e saldo na entrega.', 'Obrigado pela preferência!')) t$$, 'OK=ok');
select pg_temp.chk('validade 0', $$select public.update_company_quote_defaults(0, '', '')$$, 'ERR=1 a 365');
select pg_temp.chk('validade 366', $$select public.update_company_quote_defaults(366, '', '')$$, 'ERR=1 a 365');
select pg_temp.chk('condições 1001', $$select public.update_company_quote_defaults(15, repeat('a', 1001), '')$$, 'ERR=1000');
select pg_temp.chk('rodapé 301', $$select public.update_company_quote_defaults(15, '', repeat('a', 301))$$, 'ERR=300');
select pg_temp.chk('padrões lidos de volta (RLS de membro)', $$select (operational_preferences -> 'quote' ->> 'validity_days') from public.company_settings$$, 'OK=20');
reset role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into r(label, expect, got, ok)
  select 'auditoria gravada (perfil, logo, logo removido, padrões)', '>=4',
         (select count(*)::text from public.audit_logs where company_id = '1742f32b-c457-4377-9f8f-16a05f279d94' and action in ('company.profile_updated','company.logo_updated','company.logo_removed','company.quote_defaults_updated')),
         (select count(*) from public.audit_logs where company_id = '1742f32b-c457-4377-9f8f-16a05f279d94' and action in ('company.profile_updated','company.logo_updated','company.logo_removed','company.quote_defaults_updated')) >= 4;
insert into r(label, expect, got, ok)
  select 'auditoria NÃO guarda CNPJ nem endereço em texto', 'false',
         (select (count(*) > 0)::text from public.audit_logs where company_id = '1742f32b-c457-4377-9f8f-16a05f279d94' and action = 'company.profile_updated' and metadata::text like '%11.222.333%'),
         not exists (select 1 from public.audit_logs where company_id = '1742f32b-c457-4377-9f8f-16a05f279d94' and action = 'company.profile_updated' and metadata::text like '%11.222.333%');

select n, case when ok then 'OK ' else 'FALHA' end as res, label, case when ok then '' else 'esperado ' || expect || ' / veio ' || got end as detalhe from r order by n;
select count(*) filter (where not ok) as falhas, count(*) as total from r;

rollback;
