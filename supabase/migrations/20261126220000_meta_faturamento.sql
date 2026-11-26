-- Relatórios (etapa 5): meta mensal de faturamento por empresa. A meta vale do mês em que foi definida em diante,
-- até ser trocada; zero significa "sem meta a partir deste mês". Só dono e administrador leem e gravam.
-- Rollback: supabase/rollback/20261126220000_meta_faturamento.down.sql
begin;

create table public.company_revenue_goals (
  company_id uuid not null references public.companies(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  target numeric(12, 2) not null check (target >= 0),
  updated_by uuid references public.profiles(user_id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (company_id, month)
);
create index company_revenue_goals_updated_by_idx on public.company_revenue_goals (updated_by);

alter table public.company_revenue_goals enable row level security;

create policy company_revenue_goals_select_managers on public.company_revenue_goals
  for select to authenticated
  using (company_id in (
    select cm.company_id from public.company_members cm
     where cm.user_id = (select public.current_profile_user_id()) and cm.role in ('owner', 'admin')
  ));

-- gravar só pela função abaixo
revoke all on public.company_revenue_goals from public, anon, authenticated;
grant select on public.company_revenue_goals to authenticated;
grant all on public.company_revenue_goals to service_role;

create or replace function public.set_revenue_goal(p_company_id uuid, p_target numeric)
returns public.company_revenue_goals
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := public.current_profile_user_id();
  v_month date := date_trunc('month', public.today_sao_paulo())::date;
  v_target numeric(12, 2);
  v_before numeric(12, 2);
  v_goal public.company_revenue_goals;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  if not exists (
    select 1 from public.company_members cm
     where cm.company_id = p_company_id and cm.user_id = v_user_id and cm.role in ('owner', 'admin')
  ) then
    raise exception 'Apenas dono ou administrador podem definir a meta.';
  end if;
  if p_target is not null and (p_target < 0 or p_target > 999999999.99) then
    raise exception 'Informe uma meta entre R$ 0,00 e R$ 999.999.999,99.';
  end if;
  v_target := round(coalesce(p_target, 0), 2);

  select g.target into v_before from public.company_revenue_goals g
   where g.company_id = p_company_id and g.month <= v_month order by g.month desc limit 1;

  insert into public.company_revenue_goals (company_id, month, target, updated_by, updated_at)
  values (p_company_id, v_month, v_target, v_user_id, now())
  on conflict (company_id, month) do update set target = excluded.target, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_goal;

  insert into public.audit_logs (company_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (p_company_id, v_user_id, 'revenue_goal', p_company_id, 'revenue_goal.set',
          jsonb_build_object('month', v_month, 'target', v_target, 'before', v_before));

  return v_goal;
end
$function$;

revoke all on function public.set_revenue_goal(uuid, numeric) from public, anon;
grant execute on function public.set_revenue_goal(uuid, numeric) to authenticated, service_role;

commit;
