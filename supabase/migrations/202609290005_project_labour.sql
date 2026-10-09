create table public.labour_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  labour_name text not null,
  work_type text,
  labour_count integer not null check (labour_count > 0),
  days_worked numeric(8, 2) not null check (days_worked > 0),
  cost_per_unit numeric(12, 2) not null check (cost_per_unit >= 0),
  start_date date not null default current_date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.labour_records enable row level security;
grant select, insert, update, delete on public.labour_records to authenticated;

create policy "Authenticated users can read labour records"
  on public.labour_records as permissive for select to authenticated using (true);
create policy "Site members can read assigned labour records"
  on public.labour_records as restrictive for select to authenticated
  using (public.user_can_access_project(project_id));

create policy "Site editors can add labour records"
  on public.labour_records as permissive for insert to authenticated
  with check (public.user_can_access_project(project_id, true));
create policy "Only site editors can add labour records"
  on public.labour_records as restrictive for insert to authenticated
  with check (public.user_can_access_project(project_id, true));

create policy "Site editors can update labour records"
  on public.labour_records as permissive for update to authenticated
  using (public.user_can_access_project(project_id, true))
  with check (public.user_can_access_project(project_id, true));
create policy "Only site editors can update labour records"
  on public.labour_records as restrictive for update to authenticated
  using (public.user_can_access_project(project_id, true))
  with check (public.user_can_access_project(project_id, true));

create policy "Site editors can delete labour records"
  on public.labour_records as permissive for delete to authenticated
  using (public.user_can_access_project(project_id, true));
create policy "Only site editors can delete labour records"
  on public.labour_records as restrictive for delete to authenticated
  using (public.user_can_access_project(project_id, true));
