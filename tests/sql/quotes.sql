-- =============================================================================
-- Bateria SQL do Orçamento, Fase 1 (20261121200000_quotes) — TEST/local.
-- Tudo dentro de UMA transação com ROLLBACK: nada persiste. Rode DEPOIS de a migration estar aplicada
-- (ou concatene o corpo da migration antes, sem begin/commit).
-- =============================================================================
begin;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temp table actors as
  select (select cm.user_id from public.company_members cm where cm.company_id = '1742f32b-c457-4377-9f8f-16a05f279d94' and cm.role = 'owner' limit 1) as owner_id,
         (select p.user_id from public.profiles p where p.role = 'user' and p.status = 'active'
            and not exists (select 1 from public.company_members m where m.user_id = p.user_id and m.company_id = '1742f32b-c457-4377-9f8f-16a05f279d94')
          order by p.created_at limit 1) as outsider_id;
update public.profiles set clerk_user_id = 'qt_owner' where user_id = (select owner_id from actors);
-- "de fora": membro de OUTRA empresa (ou sem empresa); a empresa dele é só a dele
update public.profiles set clerk_user_id = 'qt_out' where user_id = (select outsider_id from actors);

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

-- dados de apoio na empresa de teste (cliente, produto, serviço) e um cliente/produto de OUTRA empresa
create temp table fx (customer uuid, product uuid, service uuid, other_company uuid, other_product uuid, other_customer uuid);
grant all on fx to authenticated, anon;
insert into fx (customer, product, service) values (
  (select id from (select gen_random_uuid() as id) x), gen_random_uuid(), gen_random_uuid());
insert into public.customers (id, company_id, name, document, phone, whatsapp, email, address, address_number, complement, neighborhood, city, state, postal_code)
  select customer, '1742f32b-c457-4377-9f8f-16a05f279d94', 'Cliente Orçamento', '529.982.247-25', '1133334444', '11988887777', 'cli@teste.com', 'Rua B', '10', 'Ap 3', 'Centro', 'Campinas', 'SP', '13000-000' from fx;
insert into public.products (id, company_id, name, sale_price) select product, '1742f32b-c457-4377-9f8f-16a05f279d94', 'Produto Orçamento', 50 from fx;
insert into public.services (id, company_id, name, sale_price) select service, '1742f32b-c457-4377-9f8f-16a05f279d94', 'Serviço Orçamento', 120 from fx;
update fx set other_company = (select id from public.companies where id <> '1742f32b-c457-4377-9f8f-16a05f279d94' limit 1);
update fx set other_product = gen_random_uuid(), other_customer = gen_random_uuid();
insert into public.products (id, company_id, name, sale_price) select other_product, other_company, 'Produto Alheio', 9 from fx where other_company is not null;
insert into public.customers (id, company_id, name) select other_customer, other_company, 'Cliente Alheio' from fx where other_company is not null;

-- helpers de itens
create or replace function pg_temp.items_ok() returns jsonb language sql as $$
  select '[{"item_type":"custom","description":"Instalação","quantity":"2","unit_price":"100.50","discount_amount":"1.00"},{"item_type":"custom","description":"Item B","quantity":"1.5","unit_price":"10"}]'::jsonb
$$;
grant execute on function pg_temp.items_ok() to authenticated, anon;

-- ================================================================ acesso
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.chk('anon NÃO cria orçamento', $$select public.create_quote(null,'X Y','','','','','',null,null,'','','','',pg_temp.items_ok(),0)$$, 'ERR=permission denied');
select pg_temp.chk('anon NÃO lê orçamentos', $$select count(*) from public.quotes$$, 'ERR=permission denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"qt_owner"}', true);

-- ================================================================ criar
select pg_temp.chk('cria com itens livres', $$select 'ok' from (select public.create_quote(null,'Fulano de Tal','','','','','Reforma',null,null,'','','','',pg_temp.items_ok(),0)) t$$, 'OK=ok');
select pg_temp.chk('número no padrão ORC-ANO-0001',
  $$select number from public.quotes where customer_name='Fulano de Tal'$$,
  'OK=ORC-' || extract(year from public.today_sao_paulo())::text || '-0001');
select pg_temp.chk('subtotal = 2×100,50−1,00 + 1,5×10 = 215,00', $$select subtotal::text from public.quotes where customer_name='Fulano de Tal'$$, 'OK=215.00');
select pg_temp.chk('total = subtotal − desconto geral', $$select total_amount::text from public.quotes where customer_name='Fulano de Tal'$$, 'OK=215.00');
select pg_temp.chk('validade padrão = 15 dias', $$select (valid_until - issued_on)::text from public.quotes where customer_name='Fulano de Tal'$$, 'OK=15');
select pg_temp.chk('nasce como rascunho', $$select status from public.quotes where customer_name='Fulano de Tal'$$, 'OK=draft');
select pg_temp.chk('2 itens com posição 1 e 2', $$select string_agg(position::text, ',' order by position) from public.quote_items where quote_id=(select id from public.quotes where customer_name='Fulano de Tal')$$, 'OK=1,2');
select pg_temp.chk('evento "created" gravado', $$select count(*)::text from public.quote_events e join public.quotes q on q.id=e.quote_id where q.customer_name='Fulano de Tal' and e.event='created'$$, 'OK=1');
select pg_temp.chk('auditoria gravada', $$select count(*)::text from public.audit_logs where action='quote.created' and entity_type='quote'$$, 'OK=1');
select pg_temp.chk('cria o segundo com desconto geral', $$select 'ok' from (select public.create_quote(null,'Beltrano Silva','','','','','',null,null,'','','','',pg_temp.items_ok(),5)) t$$, 'OK=ok');
select pg_temp.chk('segundo orçamento = 0002', $$select number from public.quotes where customer_name='Beltrano Silva'$$,
  'OK=ORC-' || extract(year from public.today_sao_paulo())::text || '-0002');
select pg_temp.chk('desconto geral 5 → total 210', $$select total_amount::text from public.quotes where customer_name='Beltrano Silva'$$, 'OK=210.00');

-- cliente do cadastro: dados copiados
select pg_temp.chk('cliente do cadastro copia os dados', $$select 'ok' from (select public.create_quote((select customer from fx),'','','','','','',null,null,'','','','',pg_temp.items_ok(),0)) t$$, 'OK=ok');
select pg_temp.chk('copiou nome/documento/telefone(whatsapp)/e-mail', $$select customer_name||'|'||customer_document||'|'||customer_phone||'|'||customer_email from public.quotes where customer_id=(select customer from fx)$$, 'OK=Cliente Orçamento|529.982.247-25|11988887777|cli@teste.com');
select pg_temp.chk('endereço montado', $$select customer_address from public.quotes where customer_id=(select customer from fx)$$, 'OK=Rua B, 10, Ap 3, Centro, Campinas/SP, 13000-000');
select pg_temp.chk('mudar o cadastro NÃO muda o orçamento emitido', $$select 'ok' from (select 1) t where (select customer_name from public.quotes where customer_id=(select customer from fx)) = 'Cliente Orçamento'$$, 'OK=ok');

-- produto e serviço do cadastro
select pg_temp.chk('item de produto usa o nome do produto', format($$select 'ok' from (select public.create_quote(null,'Com Produto','','','','','',null,null,'','','','',%L::jsonb,0)) t$$,
  '[{"item_type":"product","product_id":"' || (select product from fx) || '","quantity":"3","unit_price":"50"},{"item_type":"service","service_id":"' || (select service from fx) || '","quantity":"1","unit_price":"120"}]'), 'OK=ok');
select pg_temp.chk('descrição vem do cadastro e unidade do serviço é "serv"', $$select string_agg(description||':'||unit, ',' order by position) from public.quote_items where quote_id=(select id from public.quotes where customer_name='Com Produto')$$, 'OK=Produto Orçamento:un,Serviço Orçamento:serv');

-- ================================================================ validações
select pg_temp.chk('sem itens', $$select public.create_quote(null,'Sem Item','','','','','',null,null,'','','','','[]'::jsonb,0)$$, 'ERR=pelo menos um item');
select pg_temp.chk('itens nulo', $$select public.create_quote(null,'Sem Item','','','','','',null,null,'','','','',null,0)$$, 'ERR=pelo menos um item');
select pg_temp.chk('itens não é lista', $$select public.create_quote(null,'Sem Item','','','','','',null,null,'','','','','{"a":1}'::jsonb,0)$$, 'ERR=pelo menos um item');
select pg_temp.chk('mais de 100 itens', $$select public.create_quote(null,'Muitos','','','','','',null,null,'','','','',(select jsonb_agg('{"description":"x","quantity":"1","unit_price":"1"}'::jsonb) from generate_series(1,101)),0)$$, 'ERR=no máximo 100');
select pg_temp.chk('nome do cliente vazio', $$select public.create_quote(null,'','','','','','',null,null,'','','','',pg_temp.items_ok(),0)$$, 'ERR=nome do cliente');
select pg_temp.chk('nome só com números', $$select public.create_quote(null,'12345','','','','','',null,null,'','','','',pg_temp.items_ok(),0)$$, 'ERR=nome do cliente');
select pg_temp.chk('nome com 161 letras', format($$select public.create_quote(null,%L,'','','','','',null,null,'','','','',pg_temp.items_ok(),0)$$, repeat('a',161)), 'ERR=no máximo 160');
select pg_temp.chk('quantidade zero', $$select public.create_quote(null,'Zero Qtd','','','','','',null,null,'','','','','[{"description":"x","quantity":"0","unit_price":"1"}]'::jsonb,0)$$, 'ERR=quantidade válida');
select pg_temp.chk('quantidade negativa', $$select public.create_quote(null,'Neg Qtd','','','','','',null,null,'','','','','[{"description":"x","quantity":"-1","unit_price":"1"}]'::jsonb,0)$$, 'ERR=quantidade válida');
select pg_temp.chk('quantidade em texto', $$select public.create_quote(null,'Txt Qtd','','','','','',null,null,'','','','','[{"description":"x","quantity":"abc","unit_price":"1"}]'::jsonb,0)$$, 'ERR=quantidade válida');
select pg_temp.chk('quantidade com 4 casas', $$select public.create_quote(null,'4 casas','','','','','',null,null,'','','','','[{"description":"x","quantity":"1.0005","unit_price":"1"}]'::jsonb,0)$$, 'ERR=3 casas');
select pg_temp.chk('preço com 3 casas', $$select public.create_quote(null,'Preco 3','','','','','',null,null,'','','','','[{"description":"x","quantity":"1","unit_price":"1.005"}]'::jsonb,0)$$, 'ERR=2 casas');
select pg_temp.chk('preço negativo', $$select public.create_quote(null,'Preco Neg','','','','','',null,null,'','','','','[{"description":"x","quantity":"1","unit_price":"-5"}]'::jsonb,0)$$, 'ERR=preço válido');
select pg_temp.chk('preço ausente', $$select public.create_quote(null,'Sem Preco','','','','','',null,null,'','','','','[{"description":"x","quantity":"1"}]'::jsonb,0)$$, 'ERR=preço válido');
select pg_temp.chk('preço zero é permitido (item cortesia)', $$select 'ok' from (select public.create_quote(null,'Cortesia','','','','','',null,null,'','','','','[{"description":"Brinde","quantity":"1","unit_price":"0"}]'::jsonb,0)) t$$, 'OK=ok');
select pg_temp.chk('desconto do item maior que o item', $$select public.create_quote(null,'Desc Item','','','','','',null,null,'','','','','[{"description":"x","quantity":"1","unit_price":"10","discount_amount":"11"}]'::jsonb,0)$$, 'ERR=desconto do item');
select pg_temp.chk('desconto do item igual ao item (zera)', $$select 'ok' from (select public.create_quote(null,'Desc Total','','','','','',null,null,'','','','','[{"description":"x","quantity":"1","unit_price":"10","discount_amount":"10"}]'::jsonb,0)) t$$, 'OK=ok');
select pg_temp.chk('desconto geral maior que subtotal', $$select public.create_quote(null,'Desc Geral','','','','','',null,null,'','','','',pg_temp.items_ok(),216)$$, 'ERR=desconto geral');
select pg_temp.chk('desconto geral negativo', $$select public.create_quote(null,'Desc Neg','','','','','',null,null,'','','','',pg_temp.items_ok(),-1)$$, 'ERR=desconto geral');
select pg_temp.chk('desconto geral com 3 casas', $$select public.create_quote(null,'Desc 3','','','','','',null,null,'','','','',pg_temp.items_ok(),1.005)$$, 'ERR=desconto geral');
select pg_temp.chk('descrição vazia em item livre', $$select public.create_quote(null,'Sem Desc','','','','','',null,null,'','','','','[{"item_type":"custom","description":"  ","quantity":"1","unit_price":"1"}]'::jsonb,0)$$, 'ERR=Descreva o item');
select pg_temp.chk('descrição com 301 caracteres', format($$select public.create_quote(null,'Desc Longa','','','','','',null,null,'','','','',%L::jsonb,0)$$, '[{"description":"' || repeat('a',301) || '","quantity":"1","unit_price":"1"}]'), 'ERR=300 caracteres');
select pg_temp.chk('tipo de item inválido', $$select public.create_quote(null,'Tipo','','','','','',null,null,'','','','','[{"item_type":"hack","description":"x","quantity":"1","unit_price":"1"}]'::jsonb,0)$$, 'ERR=Tipo do item');
select pg_temp.chk('produto de OUTRA empresa é recusado', format($$select public.create_quote(null,'Alheio','','','','','',null,null,'','','','',%L::jsonb,0)$$,
  '[{"item_type":"product","product_id":"' || (select coalesce(other_product, gen_random_uuid()) from fx) || '","quantity":"1","unit_price":"1"}]'), 'ERR=não encontrado nesta empresa');
select pg_temp.chk('produto sem escolher', $$select public.create_quote(null,'Prod Vazio','','','','','',null,null,'','','','','[{"item_type":"product","quantity":"1","unit_price":"1"}]'::jsonb,0)$$, 'ERR=Escolha o produto');
select pg_temp.chk('cliente de OUTRA empresa é recusado', $$select public.create_quote((select coalesce(other_customer, gen_random_uuid()) from fx),'','','','','','',null,null,'','','','',pg_temp.items_ok(),0)$$, 'ERR=Cliente não encontrado');
select pg_temp.chk('assunto com 121 caracteres', format($$select public.create_quote(null,'Assunto','','','','',%L,null,null,'','','','',pg_temp.items_ok(),0)$$, repeat('a',121)), 'ERR=assunto');
select pg_temp.chk('condições de pagamento com 1001', format($$select public.create_quote(null,'Cond','','','','','',null,null,%L,'','','',pg_temp.items_ok(),0)$$, repeat('a',1001)), 'ERR=condições de pagamento');
select pg_temp.chk('prazo com 501', format($$select public.create_quote(null,'Prazo','','','','','',null,null,'',%L,'','',pg_temp.items_ok(),0)$$, repeat('a',501)), 'ERR=prazo de entrega');
select pg_temp.chk('observações com 2001', format($$select public.create_quote(null,'Obs','','','','','',null,null,'','',%L,'',pg_temp.items_ok(),0)$$, repeat('a',2001)), 'ERR=observações');
select pg_temp.chk('rodapé com 301', format($$select public.create_quote(null,'Rod','','','','','',null,null,'','','',%L,pg_temp.items_ok(),0)$$, repeat('a',301)), 'ERR=rodapé');
select pg_temp.chk('validade antes da emissão', $$select public.create_quote(null,'Val','','','','','',current_date,current_date-1,'','','','',pg_temp.items_ok(),0)$$, 'ERR=validade não pode');
select pg_temp.chk('validade acima de 365 dias', $$select public.create_quote(null,'Val2','','','','','',current_date,current_date+366,'','','','',pg_temp.items_ok(),0)$$, 'ERR=365 dias');
select pg_temp.chk('emissão no passado distante', $$select public.create_quote(null,'Em','','','','','','1999-01-01',null,'','','','',pg_temp.items_ok(),0)$$, 'ERR=emissão fora');
select pg_temp.chk('emissão daqui a 2 anos', $$select public.create_quote(null,'Em2','','','','','',current_date+800,null,'','','','',pg_temp.items_ok(),0)$$, 'ERR=emissão fora');
select pg_temp.chk('validade informada é respeitada', $$select 'ok' from (select public.create_quote(null,'Validade 30','','','','','',null,public.today_sao_paulo()+30,'','','','',pg_temp.items_ok(),0)) t$$, 'OK=ok');
select pg_temp.chk('total gigante (soma passa do limite)', $$select public.create_quote(null,'Gigante','','','','','',null,null,'','','','','[{"description":"x","quantity":"999999999","unit_price":"999999999"}]'::jsonb,0)$$, 'ERR=limite');
select pg_temp.chk('falha não deixa número "queimado" nem lixo', $$select count(*)::text from public.quotes where customer_name in ('Sem Item','Gigante','Alheio')$$, 'OK=0');

-- ================================================================ editar (só rascunho)
select pg_temp.chk('edita rascunho: troca itens e recalcula', format($$select 'ok' from (select public.update_quote(%L,null,'Fulano de Tal','','','','','Reforma 2',null,null,'','','','','[{"description":"Único","quantity":"4","unit_price":"25"}]'::jsonb,10)) t$$,
  (select id from public.quotes where customer_name='Fulano de Tal')), 'OK=ok');
select pg_temp.chk('totais novos: 100 − 10 = 90', $$select subtotal::text||'/'||total_amount::text from public.quotes where customer_name='Fulano de Tal'$$, 'OK=100.00/90.00');
select pg_temp.chk('itens antigos foram trocados', $$select count(*)::text from public.quote_items where quote_id=(select id from public.quotes where customer_name='Fulano de Tal')$$, 'OK=1');
select pg_temp.chk('número NÃO muda ao editar', $$select number from public.quotes where customer_name='Fulano de Tal'$$, 'OK=ORC-' || extract(year from public.today_sao_paulo())::text || '-0001');
select pg_temp.chk('edição com erro não perde os itens', format($$select public.update_quote(%L,null,'Fulano de Tal','','','','','',null,null,'','','','','[]'::jsonb,0)$$, (select id from public.quotes where customer_name='Fulano de Tal')), 'ERR=pelo menos um item');
select pg_temp.chk('itens seguem intactos após erro', $$select count(*)::text from public.quote_items where quote_id=(select id from public.quotes where customer_name='Fulano de Tal')$$, 'OK=1');
select pg_temp.chk('editar inexistente', $$select public.update_quote(gen_random_uuid(),null,'Fulano','','','','','',null,null,'','','','',pg_temp.items_ok(),0)$$, 'ERR=não encontrado');

-- ================================================================ situações
select pg_temp.chk('rascunho → aprovado é recusado', format($$select public.set_quote_status(%L,'approved')$$, (select id from public.quotes where customer_name='Fulano de Tal')), 'ERR=Não é possível passar');
select pg_temp.chk('situação inválida', format($$select public.set_quote_status(%L,'converted')$$, (select id from public.quotes where customer_name='Fulano de Tal')), 'ERR=Não é possível passar');
select pg_temp.chk('rascunho → enviado', format($$select 'ok' from (select public.set_quote_status(%L,'sent')) t$$, (select id from public.quotes where customer_name='Fulano de Tal')), 'OK=ok');
select pg_temp.chk('enviado tem data de envio', $$select (sent_at is not null)::text from public.quotes where customer_name='Fulano de Tal'$$, 'OK=true');
select pg_temp.chk('enviado NÃO pode ser editado', format($$select public.update_quote(%L,null,'Fulano de Tal','','','','','',null,null,'','','','',pg_temp.items_ok(),0)$$, (select id from public.quotes where customer_name='Fulano de Tal')), 'ERR=Só dá para editar um orçamento em rascunho');
select pg_temp.chk('enviado NÃO pode ser excluído', format($$select public.delete_quote(%L)$$, (select id from public.quotes where customer_name='Fulano de Tal')), 'ERR=Só dá para excluir');
select pg_temp.chk('enviado → enviado é recusado', format($$select public.set_quote_status(%L,'sent')$$, (select id from public.quotes where customer_name='Fulano de Tal')), 'ERR=Não é possível passar');
select pg_temp.chk('enviado → aprovado', format($$select 'ok' from (select public.set_quote_status(%L,'approved')) t$$, (select id from public.quotes where customer_name='Fulano de Tal')), 'OK=ok');
select pg_temp.chk('aprovado tem data', $$select (approved_at is not null)::text from public.quotes where customer_name='Fulano de Tal'$$, 'OK=true');
select pg_temp.chk('aprovado → rejeitado é recusado', format($$select public.set_quote_status(%L,'rejected')$$, (select id from public.quotes where customer_name='Fulano de Tal')), 'ERR=Não é possível passar');
select pg_temp.chk('aprovado → rascunho é recusado (não reabre)', format($$select public.set_quote_status(%L,'draft')$$, (select id from public.quotes where customer_name='Fulano de Tal')), 'ERR=Não é possível passar');
select pg_temp.chk('aprovado NÃO pode ser editado', format($$select public.update_quote(%L,null,'Fulano de Tal','','','','','',null,null,'','','','',pg_temp.items_ok(),0)$$, (select id from public.quotes where customer_name='Fulano de Tal')), 'ERR=Só dá para editar');

-- Beltrano: enviado → rejeitado (com motivo) → rascunho
select pg_temp.chk('Beltrano: rascunho → enviado', format($$select 'ok' from (select public.set_quote_status(%L,'sent')) t$$, (select id from public.quotes where customer_name='Beltrano Silva')), 'OK=ok');
select pg_temp.chk('motivo com 301 caracteres', format($$select public.set_quote_status(%L,'rejected',%L)$$, (select id from public.quotes where customer_name='Beltrano Silva'), repeat('a',301)), 'ERR=motivo');
select pg_temp.chk('enviado → rejeitado com motivo', format($$select 'ok' from (select public.set_quote_status(%L,'rejected','Achou caro')) t$$, (select id from public.quotes where customer_name='Beltrano Silva')), 'OK=ok');
select pg_temp.chk('motivo gravado', $$select rejection_reason from public.quotes where customer_name='Beltrano Silva'$$, 'OK=Achou caro');
select pg_temp.chk('rejeitado → rascunho (reabrir) limpa motivo e datas', format($$select 'ok' from (select public.set_quote_status(%L,'draft')) t$$, (select id from public.quotes where customer_name='Beltrano Silva')), 'OK=ok');
select pg_temp.chk('reaberto: sem motivo, sem envio', $$select (rejection_reason is null and sent_at is null and rejected_at is null)::text from public.quotes where customer_name='Beltrano Silva'$$, 'OK=true');
select pg_temp.chk('histórico do Beltrano: created, sent, rejected, reopened', $$select string_agg(distinct event, ',' order by event) from public.quote_events where quote_id=(select id from public.quotes where customer_name='Beltrano Silva')$$, 'OK=created,rejected,reopened,sent');

-- vencimento: enviado com validade passada não aprova nem envia
reset role;
update public.quotes set status='sent', sent_at=now() where customer_name='Com Produto';
update public.quotes set issued_on = public.today_sao_paulo() - 20, valid_until = public.today_sao_paulo() - 5 where customer_name='Com Produto';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"qt_owner"}', true);
select pg_temp.chk('vencido NÃO pode ser aprovado', format($$select public.set_quote_status(%L,'approved')$$, (select id from public.quotes where customer_name='Com Produto')), 'ERR=já venceu');
select pg_temp.chk('vencido pode ser rejeitado', format($$select 'ok' from (select public.set_quote_status(%L,'rejected')) t$$, (select id from public.quotes where customer_name='Com Produto')), 'OK=ok');

-- ================================================================ excluir / duplicar
select pg_temp.chk('exclui rascunho (itens vão junto)', format($$select 'ok' from (select public.delete_quote(%L)) t$$, (select id from public.quotes where customer_name='Cortesia')), 'OK=ok');
select pg_temp.chk('itens do excluído sumiram', $$select count(*)::text from public.quote_items i where not exists (select 1 from public.quotes q where q.id=i.quote_id)$$, 'OK=0');
select pg_temp.chk('auditoria de exclusão', $$select count(*)::text from public.audit_logs where action='quote.deleted'$$, 'OK=1');
select pg_temp.chk('excluir inexistente', $$select public.delete_quote(gen_random_uuid())$$, 'ERR=não encontrado');
select pg_temp.chk('cria depois da exclusão', $$select 'ok' from (select public.create_quote(null,'Depois Excluir','','','','','',null,null,'','','','',pg_temp.items_ok(),0)) t$$, 'OK=ok');
select pg_temp.chk('número de excluído NÃO é reaproveitado', $$select number from public.quotes where customer_name='Depois Excluir'$$, 'OK=ORC-' || extract(year from public.today_sao_paulo())::text || '-0008');
select pg_temp.chk('duplicar: cópia nova em rascunho', format($$select 'ok' from (select public.duplicate_quote(%L)) t$$, (select id from public.quotes where customer_name='Fulano de Tal')), 'OK=ok');
select pg_temp.chk('cópia: mesmo cliente/itens/totais, emissão hoje, validade padrão, rascunho', $$select count(*)::text from public.quotes q where q.customer_name='Fulano de Tal' and q.status='draft' and q.issued_on=public.today_sao_paulo() and q.valid_until=q.issued_on+15 and q.total_amount=90 and (select count(*) from public.quote_items i where i.quote_id=q.id)=1$$, 'OK=1');
select pg_temp.chk('duplicar inexistente', $$select public.duplicate_quote(gen_random_uuid())$$, 'ERR=não encontrado');
select pg_temp.chk('evento "duplicated" com a origem', $$select note from public.quote_events where event='duplicated' limit 1$$, 'OK=Cópia de ORC-' || extract(year from public.today_sao_paulo())::text || '-0001');

-- ================================================================ padrões da empresa (Fase 0) aplicados
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.company_settings (company_id, operational_preferences) values ('1742f32b-c457-4377-9f8f-16a05f279d94', '{"quote":{"validity_days":7,"payment_terms":"50% na entrada","footer":"Obrigado!"}}')
  on conflict (company_id) do update set operational_preferences = '{"quote":{"validity_days":7,"payment_terms":"50% na entrada","footer":"Obrigado!"}}';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"qt_owner"}', true);
select pg_temp.chk('cria com padrões da empresa', $$select 'ok' from (select public.create_quote(null,'Padrao Empresa','','','','','',null,null,null,'','',null,pg_temp.items_ok(),0)) t$$, 'OK=ok');
select pg_temp.chk('padrão: validade 7 dias', $$select (valid_until-issued_on)::text from public.quotes where customer_name='Padrao Empresa'$$, 'OK=7');
select pg_temp.chk('padrão: condições e rodapé preenchidos quando em branco (nulos)', $$select payment_terms||'|'||footer from public.quotes where customer_name='Padrao Empresa'$$, 'OK=50% na entrada|Obrigado!');
select pg_temp.chk('cria com condição própria', $$select 'ok' from (select public.create_quote(null,'Padrao Proprio','','','','','',null,null,'À vista','','',null,pg_temp.items_ok(),0)) t$$, 'OK=ok');
select pg_temp.chk('texto digitado vence o padrão', $$select payment_terms from public.quotes where customer_name='Padrao Proprio'$$, 'OK=À vista');

-- ================================================================ isolamento
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"qt_out"}', true);
select pg_temp.chk('de fora NÃO vê orçamentos da empresa de teste', $$select count(*)::text from public.quotes where company_id='1742f32b-c457-4377-9f8f-16a05f279d94'$$, 'OK=0');
select pg_temp.chk('de fora NÃO vê itens', $$select count(*)::text from public.quote_items where company_id='1742f32b-c457-4377-9f8f-16a05f279d94'$$, 'OK=0');
select pg_temp.chk('de fora NÃO vê histórico', $$select count(*)::text from public.quote_events where company_id='1742f32b-c457-4377-9f8f-16a05f279d94'$$, 'OK=0');
select pg_temp.chk('de fora NÃO edita orçamento alheio', format($$select public.update_quote(%L,null,'Invasor','','','','','',null,null,'','','','',pg_temp.items_ok(),0)$$, (select id from public.quotes where customer_name='Fulano de Tal' limit 1)), 'ERR=');
select pg_temp.chk('de fora NÃO muda situação de orçamento alheio', format($$select public.set_quote_status(%L,'sent')$$, (select id from public.quotes where customer_name='Padrao Empresa')), 'ERR=');
select pg_temp.chk('de fora NÃO exclui orçamento alheio', format($$select public.delete_quote(%L)$$, (select id from public.quotes where customer_name='Padrao Empresa')), 'ERR=');
select pg_temp.chk('de fora NÃO duplica orçamento alheio', format($$select public.duplicate_quote(%L)$$, (select id from public.quotes where customer_name='Padrao Empresa')), 'ERR=');

-- escrita direta nas tabelas é barrada (só as funções gravam)
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"qt_owner"}', true);
select pg_temp.chk('dono NÃO insere direto', $$insert into public.quotes (company_id, number, seq, year, customer_name, issued_on, valid_until) values ('1742f32b-c457-4377-9f8f-16a05f279d94','X',1,2026,'Direto',current_date,current_date)$$, 'ERR=permission denied');
select pg_temp.chk('dono NÃO altera total direto', $$update public.quotes set total_amount=1, subtotal=1$$, 'ERR=permission denied');
select pg_temp.chk('dono NÃO apaga direto', $$delete from public.quotes$$, 'ERR=permission denied');
select pg_temp.chk('dono NÃO mexe nos itens direto', $$update public.quote_items set quantity=99$$, 'ERR=permission denied');
select pg_temp.chk('dono NÃO mexe na numeração', $$update public.quote_counters set last_seq=0$$, 'ERR=permission denied');
select pg_temp.chk('dono NÃO chama função interna', $$select public._quote_next_number('1742f32b-c457-4377-9f8f-16a05f279d94', 2026)$$, 'ERR=permission denied');
select pg_temp.chk('dono NÃO chama _quote_save', $$select public._quote_save(null,null,null,null,'x',null,null,null,null,null,null,null,null,null,null,null,'[]'::jsonb,0)$$, 'ERR=permission denied');
reset role;

-- ================================================================ restrições do banco (última barreira)
select pg_temp.chk('constraint: total = subtotal − desconto', $$update public.quotes set total_amount = total_amount + 1 where customer_name='Fulano de Tal'$$, 'ERR=quotes_total_formula');
select pg_temp.chk('constraint: situação inválida', $$update public.quotes set status='xyz' where customer_name='Fulano de Tal'$$, 'ERR=quotes_status_check');
select pg_temp.chk('constraint: número único por empresa', $$insert into public.quotes (company_id, number, seq, year, customer_name, issued_on, valid_until) select company_id, number, 999, year, 'Dup', issued_on, valid_until from public.quotes where customer_name='Fulano de Tal'$$, 'ERR=quotes_company_number_key');
select pg_temp.chk('constraint: quantidade positiva', $$update public.quote_items set quantity=0$$, 'ERR=quantity_check');

-- ================================================================ resultado
select n, label, expect, got, ok from r where not ok order by n;
select count(*) filter (where ok) as passou, count(*) filter (where not ok) as falhou, count(*) as total from r;

rollback;
