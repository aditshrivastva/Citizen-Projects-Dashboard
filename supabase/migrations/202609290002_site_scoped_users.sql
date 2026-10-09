-- Each regular account gets explicit per-project access. Admins bypass this map.
create table public.site_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

alter table public.site_access enable row level security;
grant select on public.site_access to authenticated;
create policy "Users can read their own site access" on public.site_access
  for select to authenticated using (user_id = auth.uid() or public.current_app_role() = 'admin');
create policy "Only admins manage site access" on public.site_access
  for all to authenticated using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

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
      and (not require_edit or access.can_edit)
  )
$$;
revoke all on function public.user_can_access_project(uuid, boolean) from public;
grant execute on function public.user_can_access_project(uuid, boolean) to authenticated, service_role;

-- Keep existing policies, but restrict them so a broad legacy policy cannot
-- expose projects or child records outside each user's assigned sites.
create policy "Limit project reads to assigned sites" on public.projects
  as restrictive for select to authenticated
  using (public.user_can_access_project(id));
create policy "Editors can update assigned projects" on public.projects
  for update to authenticated using (public.user_can_access_project(id, true))
  with check (public.user_can_access_project(id, true));
drop policy "Only admins may update projects" on public.projects;
create policy "Only admins or site editors may update projects" on public.projects
  as restrictive for update to authenticated
  using (public.user_can_access_project(id, true))
  with check (public.user_can_access_project(id, true));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['items', 'measurements'] loop
    execute format(
      'create policy "Limit %1$s reads to assigned sites" on public.%1$I as restrictive for select to authenticated using (public.user_can_access_project(project_id))',
      table_name
    );
    execute format(
      'create policy "Site editors can insert %1$s" on public.%1$I for insert to authenticated with check (public.user_can_access_project(project_id, true))',
      table_name
    );
    execute format('drop policy "Only admins may insert %1$s" on public.%1$I', table_name);
    execute format(
      'create policy "Only admins or site editors may insert %1$s" on public.%1$I as restrictive for insert to authenticated with check (public.user_can_access_project(project_id, true))',
      table_name
    );
    execute format(
      'create policy "Site editors can update %1$s" on public.%1$I for update to authenticated using (public.user_can_access_project(project_id, true)) with check (public.user_can_access_project(project_id, true))',
      table_name
    );
    execute format('drop policy "Only admins may update %1$s" on public.%1$I', table_name);
    execute format(
      'create policy "Only admins or site editors may update %1$s" on public.%1$I as restrictive for update to authenticated using (public.user_can_access_project(project_id, true)) with check (public.user_can_access_project(project_id, true))',
      table_name
    );
    execute format(
      'create policy "Site editors can delete %1$s" on public.%1$I for delete to authenticated using (public.user_can_access_project(project_id, true))',
      table_name
    );
    execute format('drop policy "Only admins may delete %1$s" on public.%1$I', table_name);
    execute format(
      'create policy "Only admins or site editors may delete %1$s" on public.%1$I as restrictive for delete to authenticated using (public.user_can_access_project(project_id, true))',
      table_name
    );
  end loop;
end
$$;
