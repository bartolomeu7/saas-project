-- Orçamento, Fase 1: orçamentos (propostas) com itens, histórico, numeração por empresa/ano e funções de gravação.
--
-- Orçamento = documento que a empresa entrega ao cliente (PDF) antes da venda. Situações:
--   draft (rascunho, editável) -> sent (enviado, congelado) -> approved | rejected
--   "vencido" NÃO é gravado: é calculado (enviado com validade já passada), para não depender de tarefa agendada.
--   converted fica reservado para a Fase 2 (converter em venda).
-- Dados do cliente são COPIADOS para o orçamento (o PDF entregue não muda se o cadastro mudar); preços e totais são os da emissão.
-- Escrita só por funções SECURITY DEFINER (qualquer membro da empresa, como em Vendas), com auditoria; leitura por membros (RLS).
-- Totais SEMPRE calculados no banco a partir dos itens (nunca confia no total vindo do navegador).
-- Reversão: supabase/rollback/20261121200000_quotes.down.sql
begin;

-- ------------------------------------------------------------------ tabelas
create table if not exists public.quote_counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  year integer not null,
  last_seq integer not null default 0,
  primary key (company_id, year)
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null,
  seq integer not null,
  year integer not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'rejected', 'converted')),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null check (char_length(btrim(customer_name)) between 2 and 160),
  customer_document text check (customer_document is null or char_length(customer_document) <= 32),
  customer_phone text check (customer_phone is null or char_length(customer_phone) <= 32),
  customer_email text check (customer_email is null or char_length(customer_email) <= 160),
  customer_address text check (customer_address is null or char_length(customer_address) <= 400),
  title text check (title is null or char_length(title) <= 120),
  issued_on date not null,
  valid_until date not null,
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  payment_terms text check (payment_terms is null or char_length(payment_terms) <= 1000),
  delivery_terms text check (delivery_terms is null or char_length(delivery_terms) <= 500),
  notes text check (notes is null or char_length(notes) <= 2000),
  footer text check (footer is null or char_length(footer) <= 300),
  sent_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 300),
  sale_id uuid references public.sales(id) on delete set null,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_valid_range check (valid_until >= issued_on),
  constraint quotes_discount_le_subtotal check (discount_amount <= subtotal),
  constraint quotes_total_formula check (total_amount = subtotal - discount_amount)
);
create unique index if not exists quotes_company_number_key on public.quotes (company_id, number);
create unique index if not exists quotes_company_year_seq_key on public.quotes (company_id, year, seq);
create index if not exists quotes_company_created_idx on public.quotes (company_id, created_at desc);
create index if not exists quotes_company_status_idx on public.quotes (company_id, status);
create index if not exists quotes_customer_idx on public.quotes (customer_id);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  position integer not null check (position >= 1),
  item_type text not null check (item_type in ('product', 'service', 'custom')),
  product_id uuid references public.products(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  description text not null check (char_length(btrim(description)) between 1 and 300),
  unit text not null default 'un' check (char_length(unit) between 1 and 12),
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  constraint quote_items_position_key unique (quote_id, position)
);
create index if not exists quote_items_quote_idx on public.quote_items (quote_id);

create table if not exists public.quote_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  event text not null check (event in ('created', 'updated', 'sent', 'approved', 'rejected', 'reopened', 'duplicated')),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists quote_events_quote_idx on public.quote_events (quote_id, created_at);

-- ------------------------------------------------------------------ segurança: leitura por membros, escrita só por funções
alter table public.quote_counters enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_events enable row level security;

revoke all on table public.quote_counters from public, anon, authenticated;
revoke all on table public.quotes, public.quote_items, public.quote_events from public, anon;
revoke insert, update, delete on table public.quotes, public.quote_items, public.quote_events from authenticated;
grant select on table public.quotes, public.quote_items, public.quote_events to authenticated;

drop policy if exists quotes_select_member on public.quotes;
create policy quotes_select_member on public.quotes for select to authenticated
  using (exists (select 1 from public.company_members cm where cm.company_id = quotes.company_id and cm.user_id = (select public.current_profile_user_id())));
drop policy if exists quote_items_select_member on public.quote_items;
create policy quote_items_select_member on public.quote_items for select to authenticated
  using (exists (select 1 from public.company_members cm where cm.company_id = quote_items.company_id and cm.user_id = (select public.current_profile_user_id())));
drop policy if exists quote_events_select_member on public.quote_events;
create policy quote_events_select_member on public.quote_events for select to authenticated
  using (exists (select 1 from public.company_members cm where cm.company_id = quote_events.company_id and cm.user_id = (select public.current_profile_user_id())));

-- ------------------------------------------------------------------ internas
create or replace function public._company_member()
returns table (user_id uuid, company_id uuid, role public.company_role)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := public.current_profile_user_id();
  v_company uuid;
  v_role public.company_role;
begin
  if v_user is null then raise exception 'Usuário não autenticado.'; end if;
  select cm.company_id, cm.role into v_company, v_role
    from public.company_members cm where cm.user_id = v_user order by cm.created_at asc limit 1;
  if v_company is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  return query select v_user, v_company, v_role;
end;
$function$;

-- número decimal vindo do navegador (texto/JSON) sem estourar erro cru: inválido vira null
create or replace function public._quote_num(p_value text)
returns numeric
language sql
immutable
set search_path to 'public'
as $function$
  select case when p_value ~ '^[0-9]{1,12}(\.[0-9]{1,6})?$' then p_value::numeric else null end
$function$;

create or replace function public._quote_build_items(p_company uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_pos integer := 0;
  v_type text;
  v_pid uuid;
  v_sid uuid;
  v_desc text;
  v_unit text;
  v_qty numeric;
  v_price numeric;
  v_disc numeric;
  v_gross numeric;
  v_name text;
  v_punit text;
  v_found boolean;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione pelo menos um item ao orçamento.';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Um orçamento pode ter no máximo 100 itens.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Item % inválido.', v_pos; end if;
    v_type := coalesce(nullif(v_item ->> 'item_type', ''), 'custom');
    if v_type not in ('product', 'service', 'custom') then raise exception 'Tipo do item % inválido.', v_pos; end if;

    v_pid := null; v_sid := null; v_name := null; v_punit := null;
    if v_type = 'product' then
      if coalesce(v_item ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Escolha o produto do item %.', v_pos;
      end if;
      v_pid := (v_item ->> 'product_id')::uuid;
      select p.name, p.unit::text into v_name, v_punit from public.products p where p.id = v_pid and p.company_id = p_company;
      get diagnostics v_found = row_count;
      if v_name is null then raise exception 'Produto do item % não encontrado nesta empresa.', v_pos; end if;
    elsif v_type = 'service' then
      if coalesce(v_item ->> 'service_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Escolha o serviço do item %.', v_pos;
      end if;
      v_sid := (v_item ->> 'service_id')::uuid;
      select s.name into v_name from public.services s where s.id = v_sid and s.company_id = p_company;
      if v_name is null then raise exception 'Serviço do item % não encontrado nesta empresa.', v_pos; end if;
    end if;

    v_desc := nullif(btrim(coalesce(v_item ->> 'description', '')), '');
    if v_desc is null then v_desc := v_name; end if;
    if v_desc is null then raise exception 'Descreva o item %.', v_pos; end if;
    if char_length(v_desc) > 300 then raise exception 'A descrição do item % pode ter no máximo 300 caracteres.', v_pos; end if;

    v_unit := nullif(btrim(coalesce(v_item ->> 'unit', '')), '');
    if v_unit is null then v_unit := coalesce(case when v_type = 'service' then 'serv' end, v_punit, 'un'); end if;
    if char_length(v_unit) > 12 then raise exception 'A unidade do item % pode ter no máximo 12 caracteres.', v_pos; end if;

    v_qty := public._quote_num(v_item ->> 'quantity');
    if v_qty is null or v_qty <= 0 then raise exception 'Informe uma quantidade válida no item %.', v_pos; end if;
    if v_qty > 999999999.999 or v_qty <> round(v_qty, 3) then raise exception 'A quantidade do item % é grande demais ou tem mais de 3 casas.', v_pos; end if;

    v_price := public._quote_num(v_item ->> 'unit_price');
    if v_price is null then raise exception 'Informe um preço válido no item %.', v_pos; end if;
    if v_price > 999999999.99 or v_price <> round(v_price, 2) then raise exception 'O preço do item % é alto demais ou tem mais de 2 casas.', v_pos; end if;

    v_disc := coalesce(public._quote_num(coalesce(nullif(v_item ->> 'discount_amount', ''), '0')), -1);
    if v_disc < 0 or v_disc <> round(v_disc, 2) then raise exception 'O desconto do item % é inválido.', v_pos; end if;

    v_gross := round(v_qty * v_price, 2);
    if v_gross > 999999999.99 then raise exception 'O total do item % passa do limite permitido.', v_pos; end if;
    if v_disc > v_gross then raise exception 'O desconto do item % não pode ser maior que o valor do item.', v_pos; end if;

    v_out := v_out || jsonb_build_object(
      'position', v_pos, 'item_type', v_type, 'product_id', v_pid, 'service_id', v_sid, 'description', v_desc,
      'unit', v_unit, 'quantity', v_qty, 'unit_price', v_price, 'discount_amount', v_disc, 'total_amount', v_gross - v_disc);
  end loop;
  return v_out;
end;
$function$;

-- número sequencial da empresa por ano ("ORC-2026-0001"), sem repetir mesmo com duas telas ao mesmo tempo
create or replace function public._quote_next_number(p_company uuid, p_year integer)
returns table (seq integer, number text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_seq integer;
begin
  insert into public.quote_counters (company_id, year, last_seq) values (p_company, p_year, 1)
  on conflict (company_id, year) do update set last_seq = public.quote_counters.last_seq + 1
  returning last_seq into v_seq;
  return query select v_seq, 'ORC-' || p_year::text || '-' || lpad(v_seq::text, 4, '0');
end;
$function$;

create or replace function public._quote_defaults(p_company uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((select operational_preferences -> 'quote' from public.company_settings where company_id = p_company), '{}'::jsonb)
$function$;

-- cabeçalho + itens: valida, calcula e grava. p_quote_id nulo = cria.
create or replace function public._quote_save(
  p_quote_id uuid, p_user uuid, p_company uuid,
  p_customer_id uuid, p_customer_name text, p_customer_document text, p_customer_phone text, p_customer_email text, p_customer_address text,
  p_title text, p_issued_on date, p_valid_until date, p_payment_terms text, p_delivery_terms text, p_notes text, p_footer text,
  p_items jsonb, p_discount numeric
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid := p_quote_id;
  v_items jsonb;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_discount numeric := coalesce(p_discount, 0);
  v_issued date := coalesce(p_issued_on, public.today_sao_paulo());
  v_valid date := p_valid_until;
  v_defaults jsonb := public._quote_defaults(p_company);
  v_name text := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_doc text := nullif(btrim(coalesce(p_customer_document, '')), '');
  v_phone text := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_email text := nullif(btrim(coalesce(p_customer_email, '')), '');
  v_addr text := nullif(btrim(coalesce(p_customer_address, '')), '');
  v_terms text;
  v_footer text;
  v_num record;
  v_cust record;
begin
  -- cliente do cadastro: os dados são COPIADOS no momento (o cadastro pode mudar depois sem mexer no orçamento emitido)
  if p_customer_id is not null then
    select c.name, c.document, coalesce(nullif(c.whatsapp, ''), c.phone) as phone, c.email,
           nullif(btrim(concat_ws(', ', nullif(c.address, ''), nullif(c.address_number, ''), nullif(c.complement, ''), nullif(c.neighborhood, ''),
                                  nullif(concat_ws('/', nullif(c.city, ''), nullif(c.state, '')), ''), nullif(c.postal_code, ''))), '') as address
      into v_cust from public.customers c where c.id = p_customer_id and c.company_id = p_company;
    if v_cust.name is null then raise exception 'Cliente não encontrado nesta empresa.'; end if;
    v_name := v_cust.name; v_doc := v_cust.document; v_phone := v_cust.phone; v_email := v_cust.email; v_addr := v_cust.address;
  end if;
  if v_name is null or char_length(v_name) < 2 or v_name !~ '[[:alpha:]]' then raise exception 'Informe o nome do cliente (pelo menos 2 letras).'; end if;
  if char_length(v_name) > 160 then raise exception 'O nome do cliente pode ter no máximo 160 caracteres.'; end if;

  if p_title is not null and char_length(btrim(p_title)) > 120 then raise exception 'O assunto pode ter no máximo 120 caracteres.'; end if;
  if p_payment_terms is not null and char_length(btrim(p_payment_terms)) > 1000 then raise exception 'As condições de pagamento podem ter no máximo 1000 caracteres.'; end if;
  if p_delivery_terms is not null and char_length(btrim(p_delivery_terms)) > 500 then raise exception 'O prazo de entrega/execução pode ter no máximo 500 caracteres.'; end if;
  if p_notes is not null and char_length(btrim(p_notes)) > 2000 then raise exception 'As observações podem ter no máximo 2000 caracteres.'; end if;
  if p_footer is not null and char_length(btrim(p_footer)) > 300 then raise exception 'O rodapé pode ter no máximo 300 caracteres.'; end if;

  if v_valid is null then
    v_valid := v_issued + coalesce(nullif(v_defaults ->> 'validity_days', '')::integer, 15);
  end if;
  if v_issued < date '2000-01-01' or v_issued > public.today_sao_paulo() + 365 then raise exception 'Data de emissão fora do período permitido.'; end if;
  if v_valid < v_issued then raise exception 'A validade não pode ser antes da emissão.'; end if;
  if v_valid > v_issued + 365 then raise exception 'A validade pode ser de no máximo 365 dias.'; end if;

  v_items := public._quote_build_items(p_company, p_items);
  for v_item in select * from jsonb_array_elements(v_items) loop
    v_subtotal := v_subtotal + (v_item ->> 'total_amount')::numeric;
  end loop;
  if v_subtotal > 999999999.99 then raise exception 'O total do orçamento passa do limite permitido.'; end if;
  if v_discount < 0 or v_discount <> round(v_discount, 2) then raise exception 'O desconto geral é inválido.'; end if;
  if v_discount > v_subtotal then raise exception 'O desconto geral não pode ser maior que o subtotal.'; end if;

  v_terms := case when p_payment_terms is null then nullif(btrim(coalesce(v_defaults ->> 'payment_terms', '')), '') else nullif(btrim(p_payment_terms), '') end;
  v_footer := case when p_footer is null then nullif(btrim(coalesce(v_defaults ->> 'footer', '')), '') else nullif(btrim(p_footer), '') end;

  if v_id is null then
    select * into v_num from public._quote_next_number(p_company, extract(year from v_issued)::integer);
    insert into public.quotes (company_id, number, seq, year, status, customer_id, customer_name, customer_document, customer_phone, customer_email, customer_address,
                               title, issued_on, valid_until, subtotal, discount_amount, total_amount, payment_terms, delivery_terms, notes, footer, created_by)
    values (p_company, v_num.number, v_num.seq, extract(year from v_issued)::integer, 'draft', p_customer_id, v_name, v_doc, v_phone, v_email, v_addr,
            nullif(btrim(coalesce(p_title, '')), ''), v_issued, v_valid, v_subtotal, v_discount, v_subtotal - v_discount, v_terms,
            nullif(btrim(coalesce(p_delivery_terms, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), v_footer, p_user)
    returning id into v_id;
  else
    update public.quotes set customer_id = p_customer_id, customer_name = v_name, customer_document = v_doc, customer_phone = v_phone,
           customer_email = v_email, customer_address = v_addr, title = nullif(btrim(coalesce(p_title, '')), ''), issued_on = v_issued, valid_until = v_valid,
           subtotal = v_subtotal, discount_amount = v_discount, total_amount = v_subtotal - v_discount, payment_terms = v_terms,
           delivery_terms = nullif(btrim(coalesce(p_delivery_terms, '')), ''), notes = nullif(btrim(coalesce(p_notes, '')), ''), footer = v_footer, updated_at = now()
     where id = v_id;
    delete from public.quote_items where quote_id = v_id;
  end if;

  insert into public.quote_items (quote_id, company_id, position, item_type, product_id, service_id, description, unit, quantity, unit_price, discount_amount, total_amount)
  select v_id, p_company, (i ->> 'position')::integer, i ->> 'item_type', nullif(i ->> 'product_id', '')::uuid, nullif(i ->> 'service_id', '')::uuid,
         i ->> 'description', i ->> 'unit', (i ->> 'quantity')::numeric, (i ->> 'unit_price')::numeric, (i ->> 'discount_amount')::numeric, (i ->> 'total_amount')::numeric
    from jsonb_array_elements(v_items) i;

  return v_id;
end;
$function$;

-- ------------------------------------------------------------------ funções públicas (membros da empresa)
create or replace function public.create_quote(
  p_customer_id uuid, p_customer_name text, p_customer_document text, p_customer_phone text, p_customer_email text, p_customer_address text,
  p_title text, p_issued_on date, p_valid_until date, p_payment_terms text, p_delivery_terms text, p_notes text, p_footer text,
  p_items jsonb, p_discount numeric default 0
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid; v_company uuid; v_role public.company_role; v_id uuid;
begin
  select m.user_id, m.company_id, m.role into v_user, v_company, v_role from public._company_member() m;
  v_id := public._quote_save(null, v_user, v_company, p_customer_id, p_customer_name, p_customer_document, p_customer_phone, p_customer_email, p_customer_address,
                             p_title, p_issued_on, p_valid_until, p_payment_terms, p_delivery_terms, p_notes, p_footer, p_items, p_discount);
  insert into public.quote_events (quote_id, company_id, event, created_by) values (v_id, v_company, 'created', v_user);
  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'quote', v_id, 'quote.created', jsonb_build_object('number', (select number from public.quotes where id = v_id)));
  return v_id;
end;
$function$;

create or replace function public.update_quote(
  p_id uuid, p_customer_id uuid, p_customer_name text, p_customer_document text, p_customer_phone text, p_customer_email text, p_customer_address text,
  p_title text, p_issued_on date, p_valid_until date, p_payment_terms text, p_delivery_terms text, p_notes text, p_footer text,
  p_items jsonb, p_discount numeric default 0
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid; v_company uuid; v_role public.company_role; v_quote public.quotes;
begin
  select m.user_id, m.company_id, m.role into v_user, v_company, v_role from public._company_member() m;
  select * into v_quote from public.quotes where id = p_id and company_id = v_company for update;
  if v_quote.id is null then raise exception 'Orçamento não encontrado.'; end if;
  if v_quote.status <> 'draft' then raise exception 'Só dá para editar um orçamento em rascunho. Volte-o para rascunho antes.'; end if;
  perform public._quote_save(p_id, v_user, v_company, p_customer_id, p_customer_name, p_customer_document, p_customer_phone, p_customer_email, p_customer_address,
                             p_title, p_issued_on, p_valid_until, p_payment_terms, p_delivery_terms, p_notes, p_footer, p_items, p_discount);
  insert into public.quote_events (quote_id, company_id, event, created_by) values (p_id, v_company, 'updated', v_user);
  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'quote', p_id, 'quote.updated', jsonb_build_object('number', v_quote.number));
end;
$function$;

-- draft -> sent | sent -> approved | rejected | draft (reabrir) | rejected -> draft
create or replace function public.set_quote_status(p_id uuid, p_to text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid; v_company uuid; v_role public.company_role; v_quote public.quotes;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select m.user_id, m.company_id, m.role into v_user, v_company, v_role from public._company_member() m;
  select * into v_quote from public.quotes where id = p_id and company_id = v_company for update;
  if v_quote.id is null then raise exception 'Orçamento não encontrado.'; end if;
  if v_reason is not null and char_length(v_reason) > 300 then raise exception 'O motivo pode ter no máximo 300 caracteres.'; end if;

  if p_to = 'sent' and v_quote.status = 'draft' then
    if not exists (select 1 from public.quote_items where quote_id = p_id) then raise exception 'Adicione pelo menos um item ao orçamento.'; end if;
    if v_quote.valid_until < public.today_sao_paulo() then raise exception 'A validade já passou. Edite a validade antes de enviar.'; end if;
    update public.quotes set status = 'sent', sent_at = now(), updated_at = now() where id = p_id;
    insert into public.quote_events (quote_id, company_id, event, created_by) values (p_id, v_company, 'sent', v_user);
  elsif p_to = 'approved' and v_quote.status = 'sent' then
    if v_quote.valid_until < public.today_sao_paulo() then raise exception 'Este orçamento já venceu. Reabra-o e atualize a validade para aprovar.'; end if;
    update public.quotes set status = 'approved', approved_at = now(), updated_at = now() where id = p_id;
    insert into public.quote_events (quote_id, company_id, event, note, created_by) values (p_id, v_company, 'approved', v_reason, v_user);
  elsif p_to = 'rejected' and v_quote.status = 'sent' then
    update public.quotes set status = 'rejected', rejected_at = now(), rejection_reason = v_reason, updated_at = now() where id = p_id;
    insert into public.quote_events (quote_id, company_id, event, note, created_by) values (p_id, v_company, 'rejected', v_reason, v_user);
  elsif p_to = 'draft' and v_quote.status in ('sent', 'rejected') then
    update public.quotes set status = 'draft', sent_at = null, rejected_at = null, rejection_reason = null, updated_at = now() where id = p_id;
    insert into public.quote_events (quote_id, company_id, event, created_by) values (p_id, v_company, 'reopened', v_user);
  else
    raise exception 'Não é possível passar este orçamento de "%" para "%".', v_quote.status, p_to;
  end if;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'quote', p_id, 'quote.status_changed', jsonb_build_object('number', v_quote.number, 'from', v_quote.status, 'to', p_to));
end;
$function$;

create or replace function public.delete_quote(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid; v_company uuid; v_role public.company_role; v_quote public.quotes;
begin
  select m.user_id, m.company_id, m.role into v_user, v_company, v_role from public._company_member() m;
  select * into v_quote from public.quotes where id = p_id and company_id = v_company for update;
  if v_quote.id is null then raise exception 'Orçamento não encontrado.'; end if;
  if v_quote.status <> 'draft' then raise exception 'Só dá para excluir um orçamento em rascunho.'; end if;
  delete from public.quotes where id = p_id;
  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'quote', p_id, 'quote.deleted', jsonb_build_object('number', v_quote.number));
end;
$function$;

create or replace function public.duplicate_quote(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid; v_company uuid; v_role public.company_role; v_quote public.quotes; v_new uuid; v_items jsonb;
begin
  select m.user_id, m.company_id, m.role into v_user, v_company, v_role from public._company_member() m;
  select * into v_quote from public.quotes where id = p_id and company_id = v_company;
  if v_quote.id is null then raise exception 'Orçamento não encontrado.'; end if;
  select jsonb_agg(jsonb_build_object('item_type', i.item_type, 'product_id', i.product_id, 'service_id', i.service_id, 'description', i.description,
                                      'unit', i.unit, 'quantity', i.quantity, 'unit_price', i.unit_price, 'discount_amount', i.discount_amount) order by i.position)
    into v_items from public.quote_items i where i.quote_id = p_id;
  -- cópia nova: emissão de hoje e validade padrão (nunca herda datas vencidas), cliente do cadastro se ainda existir
  v_new := public._quote_save(null, v_user, v_company, v_quote.customer_id, v_quote.customer_name, v_quote.customer_document, v_quote.customer_phone,
                              v_quote.customer_email, v_quote.customer_address, v_quote.title, null, null, v_quote.payment_terms, v_quote.delivery_terms,
                              v_quote.notes, v_quote.footer, v_items, v_quote.discount_amount);
  insert into public.quote_events (quote_id, company_id, event, note, created_by) values (v_new, v_company, 'duplicated', 'Cópia de ' || v_quote.number, v_user);
  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company, v_user, 'quote', v_new, 'quote.duplicated', jsonb_build_object('from', v_quote.number));
  return v_new;
end;
$function$;

-- ------------------------------------------------------------------ permissões
revoke all on function public._company_member() from public, anon, authenticated;
revoke all on function public._quote_num(text) from public, anon, authenticated;
revoke all on function public._quote_build_items(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._quote_next_number(uuid, integer) from public, anon, authenticated;
revoke all on function public._quote_defaults(uuid) from public, anon, authenticated;
revoke all on function public._quote_save(uuid, uuid, uuid, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.create_quote(uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb, numeric) from public, anon;
revoke all on function public.update_quote(uuid, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb, numeric) from public, anon;
revoke all on function public.set_quote_status(uuid, text, text) from public, anon;
revoke all on function public.delete_quote(uuid) from public, anon;
revoke all on function public.duplicate_quote(uuid) from public, anon;
grant execute on function public.create_quote(uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb, numeric) to authenticated, service_role;
grant execute on function public.update_quote(uuid, uuid, text, text, text, text, text, text, date, date, text, text, text, text, jsonb, numeric) to authenticated, service_role;
grant execute on function public.set_quote_status(uuid, text, text) to authenticated, service_role;
grant execute on function public.delete_quote(uuid) to authenticated, service_role;
grant execute on function public.duplicate_quote(uuid) to authenticated, service_role;

-- o PostgREST só enxerga funções novas depois de recarregar o cache de esquema
notify pgrst, 'reload schema';

commit;
