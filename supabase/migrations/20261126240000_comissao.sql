-- Relatórios (etapa 6): comissão por profissional.
-- Regra: sobre o valor do serviço já com descontos (o desconto da venda inteira é rateado), só serviços, contada
-- quando a venda é totalmente recebida, na data do último pagamento. Percentual por profissional, com "a partir de".
-- Não altera vendas nem itens: o profissional vem do atendimento da agenda ou da escolha feita no relatório.
-- Rollback: supabase/rollback/20261126240000_comissao.down.sql
begin;

create table public.professional_commission_rates (
  company_id uuid not null references public.companies(id) on delete cascade,
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  valid_from date not null,
  percent numeric(5, 2) not null check (percent >= 0 and percent <= 100),
  updated_by uuid references public.profiles(user_id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (professional_id, valid_from)
);
create index professional_commission_rates_company_idx on public.professional_commission_rates (company_id);
create index professional_commission_rates_updated_by_idx on public.professional_commission_rates (updated_by);

create table public.sale_item_professionals (
  sale_item_id uuid primary key references public.sale_items(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  professional_id uuid not null references public.professional_profiles(id) on delete cascade,
  updated_by uuid references public.profiles(user_id) on delete set null,
  updated_at timestamptz not null default now()
);
create index sale_item_professionals_company_idx on public.sale_item_professionals (company_id);
create index sale_item_professionals_professional_idx on public.sale_item_professionals (professional_id);
create index sale_item_professionals_updated_by_idx on public.sale_item_professionals (updated_by);

alter table public.professional_commission_rates enable row level security;
alter table public.sale_item_professionals enable row level security;

create policy professional_commission_rates_select_managers on public.professional_commission_rates
  for select to authenticated
  using (company_id in (select cm.company_id from public.company_members cm
          where cm.user_id = (select public.current_profile_user_id()) and cm.role in ('owner', 'admin')));
create policy sale_item_professionals_select_managers on public.sale_item_professionals
  for select to authenticated
  using (company_id in (select cm.company_id from public.company_members cm
          where cm.user_id = (select public.current_profile_user_id()) and cm.role in ('owner', 'admin')));

-- gravar só pelas funções abaixo
revoke all on public.professional_commission_rates, public.sale_item_professionals from public, anon, authenticated;
grant select on public.professional_commission_rates, public.sale_item_professionals to authenticated;
grant all on public.professional_commission_rates, public.sale_item_professionals to service_role;

create or replace function public.set_commission_rate(p_professional_id uuid, p_percent numeric, p_from date)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := public.current_profile_user_id();
  v_company_id uuid;
  v_percent numeric(5, 2);
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  select p.company_id into v_company_id
    from public.professional_profiles p
    join public.company_members cm on cm.company_id = p.company_id and cm.user_id = v_user_id and cm.role in ('owner', 'admin')
   where p.id = p_professional_id;
  if v_company_id is null then raise exception 'Apenas dono ou administrador podem definir a comissão.'; end if;
  if p_percent is null or p_percent < 0 or p_percent > 100 then raise exception 'Informe um percentual entre 0 e 100.'; end if;
  if p_from is null or p_from < date '2000-01-01' or p_from > public.today_sao_paulo() + 366 then
    raise exception 'Informe uma data válida.';
  end if;
  v_percent := round(p_percent, 2);

  insert into public.professional_commission_rates (company_id, professional_id, valid_from, percent, updated_by, updated_at)
  values (v_company_id, p_professional_id, p_from, v_percent, v_user_id, now())
  on conflict (professional_id, valid_from) do update set percent = excluded.percent, updated_by = excluded.updated_by, updated_at = now();

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company_id, v_user_id, 'professional', p_professional_id, 'commission.rate_set',
          jsonb_build_object('percent', v_percent, 'valid_from', p_from));
end
$function$;

create or replace function public.set_sale_item_professional(p_sale_item_id uuid, p_professional_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := public.current_profile_user_id();
  v_company_id uuid;
  v_type text;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  select i.company_id, i.item_type::text into v_company_id, v_type
    from public.sale_items i
    join public.company_members cm on cm.company_id = i.company_id and cm.user_id = v_user_id and cm.role in ('owner', 'admin')
   where i.id = p_sale_item_id;
  if v_company_id is null then raise exception 'Apenas dono ou administrador podem escolher o profissional.'; end if;
  if v_type <> 'service' then raise exception 'Comissão vale só para serviços.'; end if;

  if p_professional_id is null then
    -- sem escolha: volta a valer o profissional do atendimento da agenda, se houver
    delete from public.sale_item_professionals where sale_item_id = p_sale_item_id;
  else
    if not exists (select 1 from public.professional_profiles p where p.id = p_professional_id and p.company_id = v_company_id) then
      raise exception 'Profissional não encontrado.';
    end if;
    insert into public.sale_item_professionals (sale_item_id, company_id, professional_id, updated_by, updated_at)
    values (p_sale_item_id, v_company_id, p_professional_id, v_user_id, now())
    on conflict (sale_item_id) do update set professional_id = excluded.professional_id, updated_by = excluded.updated_by, updated_at = now();
  end if;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (v_company_id, v_user_id, 'sale_item', p_sale_item_id, 'commission.professional_set',
          jsonb_build_object('professional_id', p_professional_id));
end
$function$;

create or replace function public.report_commission(p_company_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $function$
  with limites as (
    select (p_from at time zone 'America/Sao_Paulo')::date as de,
           (p_to at time zone 'America/Sao_Paulo')::date as ate,
           (now() at time zone 'America/Sao_Paulo')::date as hoje
  ),
  candidatas as (
    -- vendas concluídas: recebidas por inteiro no período, ou concluídas no período e ainda não recebidas
    select s.id, s.total_amount, s.payment_status = 'paid' as recebida, r.em as recebida_em
      from public.sales s
      cross join limites l
      left join lateral (
        select (max(p.paid_at) at time zone 'America/Sao_Paulo')::date as em
          from public.sale_payments p
         where p.sale_id = s.id and p.company_id = p_company_id and p.status = 'paid' and s.payment_status = 'paid'
      ) r on true
     where s.company_id = p_company_id and s.status = 'completed'
       and ((s.payment_status = 'paid' and r.em between l.de and l.ate)
         or (s.payment_status <> 'paid' and s.completed_at >= p_from and s.completed_at <= p_to))
  ),
  somas as (
    select i.sale_id, sum(i.total_amount) as itens
      from public.sale_items i
      join candidatas c on c.id = i.sale_id
     where i.company_id = p_company_id
     group by i.sale_id
  ),
  servicos as (
    select i.id as item_id, c.id as venda_id, i.description, c.recebida, coalesce(c.recebida_em, l.hoje) as data,
           -- valor do serviço depois do desconto dado na venda inteira
           coalesce(round(i.total_amount * c.total_amount / nullif(x.itens, 0), 2), 0) as base,
           m.professional_id as escolhido,
           coalesce(m.professional_id, ag.professional_id) as profissional_id
      from public.sale_items i
      join candidatas c on c.id = i.sale_id
      join somas x on x.sale_id = i.sale_id
      cross join limites l
      left join public.sale_item_professionals m on m.sale_item_id = i.id and m.company_id = p_company_id
      left join lateral (
        select a.professional_id from public.appointments a
         where a.company_id = p_company_id and a.sale_id = c.id and a.professional_id is not null
         order by (a.service_id = i.service_id) desc, a.starts_at
         limit 1
      ) ag on true
     where i.company_id = p_company_id and i.item_type = 'service'
  ),
  calculo as (
    select s.*, p.display_name as nome, coalesce(t.percent, 0) as percentual,
           round(s.base * coalesce(t.percent, 0) / 100, 2) as comissao
      from servicos s
      left join public.professional_profiles p on p.id = s.profissional_id and p.company_id = p_company_id
      left join lateral (
        -- percentual em vigor na data do recebimento (ou hoje, para o que ainda não foi recebido)
        select r.percent from public.professional_commission_rates r
         where r.professional_id = s.profissional_id and r.company_id = p_company_id and r.valid_from <= s.data
         order by r.valid_from desc limit 1
      ) t on true
     where s.base > 0
  ),
  por_profissional as (
    select profissional_id, max(nome) as nome,
           count(*) filter (where recebida) as servicos,
           coalesce(sum(base) filter (where recebida), 0) as base,
           coalesce(sum(comissao) filter (where recebida), 0) as comissao,
           coalesce(sum(base) filter (where not recebida), 0) as base_pendente,
           coalesce(sum(comissao) filter (where not recebida), 0) as comissao_pendente
      from calculo
     group by profissional_id
  ),
  lista as (
    select * from calculo where recebida order by (profissional_id is not null), data desc, description limit 200
  )
  select jsonb_build_object(
    'professionals', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', profissional_id, 'name', nome, 'services', servicos, 'base', base, 'commission', comissao,
        'pending_base', base_pendente, 'pending_commission', comissao_pendente)
        order by comissao desc, base desc, nome), '[]'::jsonb) from por_profissional),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'item_id', item_id, 'sale_id', venda_id, 'date', data, 'description', description, 'base', base,
        'professional_id', profissional_id, 'professional', nome, 'chosen', escolhido is not null,
        'percent', percentual, 'commission', comissao)
        order by (profissional_id is not null), data desc, description), '[]'::jsonb) from lista),
    'items_total', (select count(*) from calculo where recebida),
    'team', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.display_name, 'active', p.active, 'percent', t.percent, 'valid_from', t.valid_from)
        order by p.active desc, p.display_name), '[]'::jsonb)
        from public.professional_profiles p
        left join lateral (
          -- o último percentual definido, inclusive o que ainda vai começar
          select r.percent, r.valid_from from public.professional_commission_rates r
           where r.professional_id = p.id and r.company_id = p_company_id order by r.valid_from desc limit 1
        ) t on true
       where p.company_id = p_company_id)
  );
$function$;

revoke all on function public.set_commission_rate(uuid, numeric, date) from public, anon;
revoke all on function public.set_sale_item_professional(uuid, uuid) from public, anon;
revoke all on function public.report_commission(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.set_commission_rate(uuid, numeric, date) to authenticated, service_role;
grant execute on function public.set_sale_item_professional(uuid, uuid) to authenticated, service_role;
grant execute on function public.report_commission(uuid, timestamptz, timestamptz) to authenticated, service_role;

commit;
