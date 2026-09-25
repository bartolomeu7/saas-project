-- Phase 2: RLS init-plan hardening.
--
-- Applied to Supabase as migration:
-- 20260923115406_phase2_rls_initplan_hardening

do $$
declare
  r record;
  v_qual text;
  v_check text;
  v_stmt text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual,'') like '%auth.uid()%'
        or coalesce(with_check,'') like '%auth.uid()%'
      )
  loop
    v_qual := case
      when r.qual is null then null
      else regexp_replace(r.qual, 'auth\.uid\(\)', '(select auth.uid())', 'g')
    end;

    v_check := case
      when r.with_check is null then null
      else regexp_replace(r.with_check, 'auth\.uid\(\)', '(select auth.uid())', 'g')
    end;

    v_stmt := format(
      'alter policy %I on %I.%I',
      r.policyname, r.schemaname, r.tablename
    );

    if v_qual is not null then
      v_stmt := v_stmt || format(' using (%s)', v_qual);
    end if;

    if v_check is not null then
      v_stmt := v_stmt || format(' with check (%s)', v_check);
    end if;

    execute v_stmt;
  end loop;
end
$$;
