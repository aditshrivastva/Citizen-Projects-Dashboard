alter table public.site_access
  add column if not exists can_edit_billing boolean not null default false,
  add column if not exists can_edit_payments boolean not null default false;

update public.site_access
set can_edit_billing = true,
    can_edit_payments = true
where can_edit = true and not can_edit_billing and not can_edit_payments;

create or replace function public.user_can_edit_module(target_project_id uuid, module_name text)
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
      and case module_name
        when 'measurements' then access.can_edit_measurements
        when 'items' then access.can_edit_items
        when 'transport' then access.can_edit_transport
        when 'labour' then access.can_edit_labour
        when 'billing' then access.can_edit_billing
        when 'payments' then access.can_edit_payments
        else false
      end
  )
$$;
revoke all on function public.user_can_edit_module(uuid, text) from public;
grant execute on function public.user_can_edit_module(uuid, text) to authenticated, service_role;

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
        not require_edit or access.can_edit
        or access.can_edit_measurements or access.can_edit_items
        or access.can_edit_transport or access.can_edit_labour
        or access.can_edit_billing or access.can_edit_payments
      )
  )
$$;

create table public.project_bills (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  bill_number text not null,
  bill_date date not null default current_date,
  due_date date,
  amount numeric(14, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue', 'cancelled')),
  pdf_path text,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(project_id, bill_number)
);

create table public.project_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  reference text not null,
  payment_type text not null check (payment_type in ('cash', 'bank_transfer', 'cheque', 'upi', 'card', 'other')),
  payment_date date not null default current_date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.project_bills enable row level security;
alter table public.project_payments enable row level security;
grant select, insert, update, delete on public.project_bills, public.project_payments to authenticated;

create policy "Authenticated users can read project bills" on public.project_bills
  as permissive for select to authenticated using (true);
create policy "Site members can read assigned project bills" on public.project_bills
  as restrictive for select to authenticated using (public.user_can_access_project(project_id));
create policy "Billing editors can insert bills" on public.project_bills
  for insert to authenticated with check (public.user_can_edit_module(project_id, 'billing'));
create policy "Billing editors may only insert bills" on public.project_bills
  as restrictive for insert to authenticated with check (public.user_can_edit_module(project_id, 'billing'));
create policy "Billing editors can update bills" on public.project_bills
  for update to authenticated using (public.user_can_edit_module(project_id, 'billing'))
  with check (public.user_can_edit_module(project_id, 'billing'));
create policy "Billing editors may only update bills" on public.project_bills
  as restrictive for update to authenticated using (public.user_can_edit_module(project_id, 'billing'))
  with check (public.user_can_edit_module(project_id, 'billing'));
create policy "Billing editors can delete bills" on public.project_bills
  for delete to authenticated using (public.user_can_edit_module(project_id, 'billing'));
create policy "Billing editors may only delete bills" on public.project_bills
  as restrictive for delete to authenticated using (public.user_can_edit_module(project_id, 'billing'));

create policy "Authenticated users can read project payments" on public.project_payments
  as permissive for select to authenticated using (true);
create policy "Site members can read assigned project payments" on public.project_payments
  as restrictive for select to authenticated using (public.user_can_access_project(project_id));
create policy "Payment editors can insert payments" on public.project_payments
  for insert to authenticated with check (public.user_can_edit_module(project_id, 'payments'));
create policy "Payment editors may only insert payments" on public.project_payments
  as restrictive for insert to authenticated with check (public.user_can_edit_module(project_id, 'payments'));
create policy "Payment editors can update payments" on public.project_payments
  for update to authenticated using (public.user_can_edit_module(project_id, 'payments'))
  with check (public.user_can_edit_module(project_id, 'payments'));
create policy "Payment editors may only update payments" on public.project_payments
  as restrictive for update to authenticated using (public.user_can_edit_module(project_id, 'payments'))
  with check (public.user_can_edit_module(project_id, 'payments'));
create policy "Payment editors can delete payments" on public.project_payments
  for delete to authenticated using (public.user_can_edit_module(project_id, 'payments'));
create policy "Payment editors may only delete payments" on public.project_payments
  as restrictive for delete to authenticated using (public.user_can_edit_module(project_id, 'payments'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-bills', 'project-bills', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf'];

create policy "Project members can read bill PDFs" on storage.objects
  for select to authenticated using (
    bucket_id = 'project-bills' and (
      public.current_app_role() = 'admin' or exists (
        select 1 from public.site_access access
        where access.user_id = auth.uid()
          and access.project_id::text = (storage.foldername(name))[1]
      )
    )
  );
create policy "Restrict bill PDF reads to project members" on storage.objects
  as restrictive for select to authenticated using (
    bucket_id <> 'project-bills' or (
      public.current_app_role() = 'admin' or exists (
        select 1 from public.site_access access
        where access.user_id = auth.uid()
          and access.project_id::text = (storage.foldername(name))[1]
      )
    )
  );
create policy "Billing editors can upload bill PDFs" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'project-bills' and public.user_can_edit_module(
      case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid else null end,
      'billing'
    )
  );
create policy "Restrict bill PDF uploads to billing editors" on storage.objects
  as restrictive for insert to authenticated with check (
    bucket_id <> 'project-bills' or public.user_can_edit_module(
      case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid else null end,
      'billing'
    )
  );
create policy "Billing editors can update bill PDFs" on storage.objects
  for update to authenticated using (
    bucket_id = 'project-bills' and public.user_can_edit_module(
      case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid else null end,
      'billing'
    )
  ) with check (
    bucket_id = 'project-bills' and public.user_can_edit_module(
      case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid else null end,
      'billing'
    )
  );
create policy "Restrict bill PDF updates to billing editors" on storage.objects
  as restrictive for update to authenticated using (
    bucket_id <> 'project-bills' or public.user_can_edit_module(
      case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid else null end,
      'billing'
    )
  ) with check (
    bucket_id <> 'project-bills' or public.user_can_edit_module(
      case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid else null end,
      'billing'
    )
  );
create policy "Billing editors can delete bill PDFs" on storage.objects
  for delete to authenticated using (
    bucket_id = 'project-bills' and public.user_can_edit_module(
      case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid else null end,
      'billing'
    )
  );
create policy "Restrict bill PDF deletes to billing editors" on storage.objects
  as restrictive for delete to authenticated using (
    bucket_id <> 'project-bills' or public.user_can_edit_module(
      case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid else null end,
      'billing'
    )
  );
