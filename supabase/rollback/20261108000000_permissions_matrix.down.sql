-- Rollback de 20261108000000_permissions_matrix.
-- Devolve o comportamento anterior: caixa só owner/admin, qualquer membro altera preço/custo, qualquer membro lê
-- financeiro/fornecedores/compras e admin gerencia admins. Dados não são tocados.
begin;

-- 1. CAIXA (corpo anterior)
create or replace function public.open_cash_register(p_opening_balance numeric, p_notes text default null::text)
returns public.cash_registers
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := public.current_profile_user_id();
  v_company_id uuid;
  v_role public.company_role;
  v_register public.cash_registers;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select cm.company_id, cm.role into v_company_id, v_role
    from public.company_members cm where cm.user_id = v_user_id;

  if v_company_id is null then
    raise exception 'Nenhuma empresa encontrada para o usuário atual.';
  end if;

  if v_role not in ('owner', 'admin') then
    raise exception 'Apenas owner/admin podem abrir o caixa.';
  end if;

  if p_opening_balance is null or p_opening_balance < 0 then
    raise exception 'O saldo inicial não pode ser negativo.';
  end if;

  -- Serializa aberturas concorrentes da mesma empresa (duas abas, duplo
  -- clique). O índice único parcial (seção 2) é a garantia definitiva
  -- mesmo sem este lock — ele só evita uma violação de constraint crua no
  -- caso comum, devolvendo a mensagem amigável abaixo.
  perform pg_advisory_xact_lock(hashtext(v_company_id::text || ':cash_register'));

  if exists (
    select 1 from public.cash_registers where company_id = v_company_id and status = 'open'
  ) then
    raise exception 'Já existe um caixa aberto para esta empresa.';
  end if;

  insert into public.cash_registers (company_id, opened_by, opening_balance, notes)
  values (v_company_id, v_user_id, p_opening_balance, p_notes)
  returning * into v_register;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_company_id, v_user_id, 'cash_register', v_register.id, 'cash_register.opened',
    jsonb_build_object('opening_balance', p_opening_balance)
  );

  return v_register;
end;
$function$;

create or replace function public.close_cash_register(p_cash_register_id uuid, p_informed_cash_balance numeric, p_notes text default null::text)
returns public.cash_registers
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := public.current_profile_user_id();
  v_role public.company_role;
  v_register public.cash_registers;
  v_cash_in numeric(12, 2);
  v_cash_out numeric(12, 2);
  v_expected numeric(12, 2);
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  -- Trava a linha: uma segunda chamada concorrente de fechamento do MESMO
  -- caixa espera aqui e, ao continuar, já vê status='closed' — nunca as
  -- duas conseguem fechar "ao mesmo tempo".
  select * into v_register from public.cash_registers where id = p_cash_register_id for update;
  if v_register is null then
    raise exception 'Caixa não encontrado.';
  end if;

  select cm.role into v_role
    from public.company_members cm
    where cm.company_id = v_register.company_id and cm.user_id = v_user_id;

  if v_role is null then
    raise exception 'Você não tem acesso a este caixa.';
  end if;

  if v_role not in ('owner', 'admin') then
    raise exception 'Apenas owner/admin podem fechar o caixa.';
  end if;

  if v_register.status <> 'open' then
    raise exception 'Este caixa já está fechado.';
  end if;

  if p_informed_cash_balance is null or p_informed_cash_balance < 0 then
    raise exception 'O saldo informado não pode ser negativo.';
  end if;

  -- Só dinheiro entra na conferência de fechamento (decisão c) — Pix,
  -- débito e cartão não passam pela gaveta física.
  select coalesce(sum(amount), 0) into v_cash_in
    from public.cash_movements
    where cash_register_id = p_cash_register_id and direction = 'in' and method = 'cash';

  select coalesce(sum(amount), 0) into v_cash_out
    from public.cash_movements
    where cash_register_id = p_cash_register_id and direction = 'out' and method = 'cash';

  v_expected := v_register.opening_balance + v_cash_in - v_cash_out;

  update public.cash_registers
    set status = 'closed',
        closed_by = v_user_id,
        closed_at = now(),
        expected_cash_balance = v_expected,
        informed_cash_balance = p_informed_cash_balance,
        cash_difference = p_informed_cash_balance - v_expected,
        notes = coalesce(p_notes, notes)
    where id = p_cash_register_id
    returning * into v_register;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (
    v_register.company_id, v_user_id, 'cash_register', v_register.id, 'cash_register.closed',
    jsonb_build_object(
      'expected_cash_balance', v_expected,
      'informed_cash_balance', p_informed_cash_balance,
      'cash_difference', p_informed_cash_balance - v_expected
    )
  );

  return v_register;
end;
$function$;

-- 2. PREÇO E CUSTO
drop trigger if exists products_guard_price_cost on public.products;
drop trigger if exists services_guard_price_cost on public.services;
drop function if exists public.guard_price_cost_change();

-- 3 e 4. LEITURA por qualquer membro (políticas originais; as tabelas de fornecedor/pedido usavam o nome sem apelido)
do $do$
declare
  t text;
  pred_cm text := $p$(company_id in (
    select cm.company_id from public.company_members cm
    where cm.user_id = (select public.current_profile_user_id() as uid)))$p$;
  pred_plain text := $p$(company_id in (
    select company_members.company_id from public.company_members
    where company_members.user_id = (select public.current_profile_user_id() as uid)))$p$;
begin
  foreach t in array array[
    'financial_entries', 'accounts_payable', 'financial_categories', 'cost_centers',
    'purchase_receipts', 'purchase_receipt_items'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_managers', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own_company', t);
    execute format('create policy %I on public.%I for select to authenticated using %s', t || '_select_own_company', t, pred_cm);
  end loop;

  foreach t in array array['suppliers', 'supplier_products', 'purchase_orders', 'purchase_order_items'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_managers', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own_company', t);
    execute format('create policy %I on public.%I for select to authenticated using %s', t || '_select_own_company', t, pred_plain);
  end loop;

  drop policy if exists suppliers_insert_managers on public.suppliers;
  drop policy if exists suppliers_insert_own_company on public.suppliers;
  execute format('create policy suppliers_insert_own_company on public.suppliers for insert to authenticated with check %s', pred_plain);

  drop policy if exists suppliers_update_managers on public.suppliers;
  drop policy if exists suppliers_update_own_company on public.suppliers;
  execute format('create policy suppliers_update_own_company on public.suppliers for update to authenticated using %s with check %s', pred_plain, pred_plain);
end
$do$;

-- 5. EQUIPE (corpos anteriores)
create or replace function public.add_existing_company_member(p_email text, p_role public.company_role default 'employee'::public.company_role)
returns public.company_members
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_actor_role public.company_role;
  v_row public.company_members;
  v_max_additional integer;
  v_current_additional integer;
begin
  if public.current_profile_user_id() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select cm0.company_id, cm0.role into v_company_id, v_actor_role
  from public.company_members cm0
  where cm0.user_id = public.current_profile_user_id()
  order by cm0.created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_actor_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem adicionar colaboradores.'; end if;
  if p_role = 'owner' then raise exception 'Novo colaborador deve entrar como admin ou employee.'; end if;
  if nullif(trim(p_email), '') is null then raise exception 'Informe o e-mail do colaborador.'; end if;

  select pr.user_id into v_user_id
  from public.profiles pr
  where lower(pr.email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'Usuário não encontrado. A pessoa precisa criar a conta no Prime Ges antes de ser adicionada.';
  end if;

  if exists (
    select 1 from public.company_members cm1
    where cm1.company_id = v_company_id and cm1.user_id = v_user_id
  ) then
    raise exception 'Este usuário já pertence à empresa.';
  end if;

  select ce.max_additional_users into v_max_additional
  from public.company_entitlements ce
  where ce.company_id = v_company_id
  for update;

  select count(*) into v_current_additional
  from public.company_members cm2
  where cm2.company_id = v_company_id and cm2.role <> 'owner';

  if v_current_additional >= coalesce(v_max_additional, 0) then
    raise exception 'Limite de usuários do plano atingido (% usuário(s) adicional(is) além do proprietário). Altere o plano para adicionar mais pessoas.',
      coalesce(v_max_additional, 0);
  end if;

  insert into public.company_members(company_id, user_id, role)
  values(v_company_id, v_user_id, p_role)
  returning * into v_row;

  insert into public.audit_logs (
    company_id, actor_user_id, entity_type, entity_id, action, metadata
  ) values (
    v_company_id, public.current_profile_user_id(), 'company_member', v_row.id, 'company_member.added',
    jsonb_build_object('member_user_id', v_row.user_id, 'role', v_row.role)
  );

  return v_row;
end;
$function$;

create or replace function public.update_company_member_role(p_member_id uuid, p_role public.company_role)
returns public.company_members
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_actor_role public.company_role;
  v_target public.company_members;
  v_owner_count integer;
  v_previous_role public.company_role;
begin
  if public.current_profile_user_id() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select company_id, role into v_company_id, v_actor_role
  from public.company_members
  where user_id = public.current_profile_user_id()
  order by created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_actor_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem alterar permissões.'; end if;

  select * into v_target
  from public.company_members
  where id = p_member_id and company_id = v_company_id
  for update;

  if v_target is null then raise exception 'Colaborador não encontrado.'; end if;

  v_previous_role := v_target.role;

  if v_target.role = 'owner' and p_role <> 'owner' then
    select count(*) into v_owner_count
    from public.company_members
    where company_id = v_company_id and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'A empresa precisa manter pelo menos um owner.';
    end if;
  end if;

  if p_role = 'owner' and v_actor_role <> 'owner' then
    raise exception 'Somente owner pode promover outro colaborador a owner.';
  end if;

  update public.company_members
  set role = p_role
  where id = p_member_id
  returning * into v_target;

  insert into public.audit_logs (
    company_id, actor_user_id, entity_type, entity_id, action, metadata
  ) values (
    v_company_id, public.current_profile_user_id(), 'company_member', v_target.id, 'company_member.role_changed',
    jsonb_build_object(
      'member_user_id', v_target.user_id,
      'previous_role', v_previous_role,
      'new_role', v_target.role
    )
  );

  return v_target;
end;
$function$;

create or replace function public.remove_company_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_actor_role public.company_role;
  v_target public.company_members;
  v_owner_count integer;
begin
  if public.current_profile_user_id() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select company_id, role into v_company_id, v_actor_role
  from public.company_members
  where user_id = public.current_profile_user_id()
  order by created_at asc
  limit 1;

  if v_company_id is null then raise exception 'Nenhuma empresa encontrada.'; end if;
  if v_actor_role not in ('owner','admin') then raise exception 'Apenas owner/admin podem remover colaboradores.'; end if;

  select * into v_target
  from public.company_members
  where id = p_member_id and company_id = v_company_id
  for update;

  if v_target is null then raise exception 'Colaborador não encontrado.'; end if;
  if v_target.user_id = public.current_profile_user_id() and v_target.role = 'owner' then raise exception 'O owner atual não pode remover a própria conta.'; end if;

  if v_target.role = 'owner' then
    select count(*) into v_owner_count
    from public.company_members
    where company_id = v_company_id and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'Não é possível remover o último owner.';
    end if;
    if v_actor_role <> 'owner' then
      raise exception 'Somente owner pode remover outro owner.';
    end if;
  end if;

  delete from public.company_members where id = p_member_id;

  insert into public.audit_logs (
    company_id, actor_user_id, entity_type, entity_id, action, metadata
  ) values (
    v_company_id, public.current_profile_user_id(), 'company_member', p_member_id, 'company_member.removed',
    jsonb_build_object('member_user_id', v_target.user_id, 'role', v_target.role)
  );
end;
$function$;

commit;
