create table public.transports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  truck_number text not null,
  truck_type text,
  driver_name text,
  driver_phone text,
  material text not null,
  quantity numeric(12, 2) not null check (quantity > 0),
  unit text not null default 'ton',
  trip_date date not null default current_date,
  arrival_time time,
  origin text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.transports enable row level security;
grant select, insert, update, delete on public.transports to authenticated;

create policy "Authenticated users can read transports"
  on public.transports as permissive for select to authenticated using (true);
create policy "Site members can read assigned transports"
  on public.transports as restrictive for select to authenticated
  using (public.user_can_access_project(project_id));

create policy "Site editors can add transports"
  on public.transports as permissive for insert to authenticated
  with check (public.user_can_access_project(project_id, true));
create policy "Only site editors can add transports"
  on public.transports as restrictive for insert to authenticated
  with check (public.user_can_access_project(project_id, true));

create policy "Site editors can update transports"
  on public.transports as permissive for update to authenticated
  using (public.user_can_access_project(project_id, true))
  with check (public.user_can_access_project(project_id, true));
create policy "Only site editors can update transports"
  on public.transports as restrictive for update to authenticated
  using (public.user_can_access_project(project_id, true))
  with check (public.user_can_access_project(project_id, true));

create policy "Site editors can delete transports"
  on public.transports as permissive for delete to authenticated
  using (public.user_can_access_project(project_id, true));
create policy "Only site editors can delete transports"
  on public.transports as restrictive for delete to authenticated
  using (public.user_can_access_project(project_id, true));
