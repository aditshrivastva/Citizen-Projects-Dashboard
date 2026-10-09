alter table public.site_access
  add column if not exists can_edit_measurements boolean not null default false,
  add column if not exists can_edit_items boolean not null default false,
  add column if not exists can_edit_transport boolean not null default false,
  add column if not exists can_edit_labour boolean not null default false;

-- Preserve any site-wide edit grants created before permissions were split by module.
update public.site_access
set can_edit_measurements = true,
    can_edit_items = true,
    can_edit_transport = true,
    can_edit_labour = true
where can_edit = true
  and not can_edit_measurements
  and not can_edit_items
  and not can_edit_transport
  and not can_edit_labour;

create or replace function public.user_can_edit_module(target_project_id uuid, module_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_app_role() = 'admin' or exists (
    select 1
    from public.site_access access
    where access.user_id = auth.uid()
      and access.project_id = target_project_id
      and case module_name
        when 'measurements' then access.can_edit_measurements
        when 'items' then access.can_edit_items
        when 'transport' then access.can_edit_transport
        when 'labour' then access.can_edit_labour
        else false
      end
  )
$$;
revoke all on function public.user_can_edit_module(uuid, text) from public;
grant execute on function public.user_can_edit_module(uuid, text) to authenticated, service_role;

-- A grant for any module still passes older general edit guards. The
-- module-specific restrictive policies below narrow writes to the right card.
create or replace function public.user_can_access_project(target_project_id uuid, require_edit boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_app_role() = 'admin' or exists (
    select 1 from public.site_access access
    where access.user_id = auth.uid()
      and access.project_id = target_project_id
      and (
        not require_edit
        or access.can_edit
        or access.can_edit_measurements
        or access.can_edit_items
        or access.can_edit_transport
        or access.can_edit_labour
      )
  )
$$;

-- Project metadata itself remains admin-only; module grants do not grant it.
drop policy if exists "Only admins or site editors may update projects" on public.projects;
create policy "Only admins may update project details" on public.projects
  as restrictive for update to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

do $$
declare
  table_name text;
  module_name text;
  action_name text;
  predicate text;
begin
  for table_name, module_name in
    select * from (values
      ('measurements', 'measurements'),
      ('items', 'items'),
      ('transports', 'transport'),
      ('labour_records', 'labour')
    ) as module_tables(table_name, module_name)
  loop
    foreach action_name in array array['insert', 'update', 'delete'] loop
      predicate := format('public.user_can_edit_module(project_id, %L)', module_name);
      execute format('drop policy if exists "Module grant only %1$s %2$s" on public.%3$I', action_name, table_name, table_name);
      if action_name = 'insert' then
        execute format(
          'create policy "Module grant only %1$s %2$s" on public.%3$I as restrictive for insert to authenticated with check (%4$s)',
          action_name, table_name, table_name, predicate
        );
      elsif action_name = 'update' then
        execute format(
          'create policy "Module grant only %1$s %2$s" on public.%3$I as restrictive for update to authenticated using (%4$s) with check (%4$s)',
          action_name, table_name, table_name, predicate
        );
      else
        execute format(
          'create policy "Module grant only %1$s %2$s" on public.%3$I as restrictive for delete to authenticated using (%4$s)',
          action_name, table_name, table_name, predicate
        );
      end if;
    end loop;
  end loop;
end
$$;
