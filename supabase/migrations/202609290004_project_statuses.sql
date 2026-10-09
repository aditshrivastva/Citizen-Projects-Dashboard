-- Extend the project status values while retaining existing statuses.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.projects'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.projects drop constraint %I', constraint_name);
  end loop;
end
$$;

alter table public.projects
  add constraint projects_status_check
  check (status in (
    'planning',
    'active',
    'manufacturing',
    'in_transit',
    'payment_pending',
    'on_hold',
    'completed',
    'cancelled'
  ));
