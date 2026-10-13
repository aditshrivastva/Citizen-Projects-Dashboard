create table public.project_order_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  item_name text not null,
  measurement_mode text not null check (measurement_mode in ('dimensions', 'direct')),
  length numeric(12, 4),
  width numeric(12, 4),
  dimension_unit text check (dimension_unit in ('ft', 'm')),
  unit_count numeric(12, 3),
  direct_quantity numeric(14, 4),
  unit text not null check (unit in ('sq_ft', 'piece', 'sq_m')),
  quantity numeric(14, 4) generated always as (
    case
      when measurement_mode = 'direct' then direct_quantity
      when unit = 'sq_ft' and dimension_unit = 'm' then length * width * unit_count * 10.7639104167
      when unit = 'sq_m' and dimension_unit = 'ft' then length * width * unit_count * 0.09290304
      else length * width * unit_count
    end
  ) stored not null,
  rate numeric(14, 2) not null check (rate >= 0),
  amount numeric(14, 2) generated always as (
    round((
      case
        when measurement_mode = 'direct' then direct_quantity
        when unit = 'sq_ft' and dimension_unit = 'm' then length * width * unit_count * 10.7639104167
        when unit = 'sq_m' and dimension_unit = 'ft' then length * width * unit_count * 0.09290304
        else length * width * unit_count
      end
    ) * rate, 2)
  ) stored not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint project_order_item_measurement_check check (
    (measurement_mode = 'direct' and direct_quantity is not null and direct_quantity > 0 and length is null and width is null and dimension_unit is null and unit_count is null)
    or
    (measurement_mode = 'dimensions' and unit in ('sq_ft', 'sq_m') and length is not null and length > 0 and width is not null and width > 0 and dimension_unit is not null and unit_count is not null and unit_count > 0 and direct_quantity is null)
  )
);

create table public.project_order_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  freight_charge numeric(14, 2) not null default 0 check (freight_charge >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.project_order_items enable row level security;
alter table public.project_order_settings enable row level security;
grant select, insert, update, delete on public.project_order_items, public.project_order_settings to authenticated;

create policy "Authenticated users can read project order items" on public.project_order_items
  as permissive for select to authenticated using (true);
create policy "Limit project order item reads to site members" on public.project_order_items
  as restrictive for select to authenticated using (public.user_can_access_project(project_id));
create policy "Billing editors can insert project order items" on public.project_order_items
  for insert to authenticated with check (public.user_can_edit_module(project_id, 'billing'));
create policy "Restrict project order item inserts to billing editors" on public.project_order_items
  as restrictive for insert to authenticated with check (public.user_can_edit_module(project_id, 'billing'));
create policy "Billing editors can update project order items" on public.project_order_items
  for update to authenticated using (public.user_can_edit_module(project_id, 'billing'))
  with check (public.user_can_edit_module(project_id, 'billing'));
create policy "Restrict project order item updates to billing editors" on public.project_order_items
  as restrictive for update to authenticated using (public.user_can_edit_module(project_id, 'billing'))
  with check (public.user_can_edit_module(project_id, 'billing'));
create policy "Billing editors can delete project order items" on public.project_order_items
  for delete to authenticated using (public.user_can_edit_module(project_id, 'billing'));
create policy "Restrict project order item deletes to billing editors" on public.project_order_items
  as restrictive for delete to authenticated using (public.user_can_edit_module(project_id, 'billing'));

create policy "Authenticated users can read project order settings" on public.project_order_settings
  as permissive for select to authenticated using (true);
create policy "Limit project order settings reads to site members" on public.project_order_settings
  as restrictive for select to authenticated using (public.user_can_access_project(project_id));
create policy "Billing editors can insert project order settings" on public.project_order_settings
  for insert to authenticated with check (public.user_can_edit_module(project_id, 'billing'));
create policy "Restrict project order settings inserts to billing editors" on public.project_order_settings
  as restrictive for insert to authenticated with check (public.user_can_edit_module(project_id, 'billing'));
create policy "Billing editors can update project order settings" on public.project_order_settings
  for update to authenticated using (public.user_can_edit_module(project_id, 'billing'))
  with check (public.user_can_edit_module(project_id, 'billing'));
create policy "Restrict project order settings updates to billing editors" on public.project_order_settings
  as restrictive for update to authenticated using (public.user_can_edit_module(project_id, 'billing'))
  with check (public.user_can_edit_module(project_id, 'billing'));
create policy "Billing editors can delete project order settings" on public.project_order_settings
  for delete to authenticated using (public.user_can_edit_module(project_id, 'billing'));
create policy "Restrict project order settings deletes to billing editors" on public.project_order_settings
  as restrictive for delete to authenticated using (public.user_can_edit_module(project_id, 'billing'));
