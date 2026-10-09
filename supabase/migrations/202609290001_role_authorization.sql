-- Role source of truth: auth.users.raw_app_meta_data.role (Supabase app_metadata).
-- Set it from Supabase Dashboard > Authentication > Users > user metadata, or
-- via the Admin API. Never set role in user_metadata or accept it from the browser.
create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

-- Authenticated users can read the shared project data.
-- Admins can create, update, and delete; restrictive policies also prevent any
-- older permissive policy from accidentally allowing non-admin writes.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['projects', 'items', 'measurements'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy "Authenticated users can read %1$s" on public.%1$I as permissive for select to authenticated using (true)', table_name);
    execute format('create policy "Admins can insert %1$s" on public.%1$I as permissive for insert to authenticated with check (public.current_app_role() = ''admin'')', table_name);
    execute format('create policy "Admins can update %1$s" on public.%1$I as permissive for update to authenticated using (public.current_app_role() = ''admin'') with check (public.current_app_role() = ''admin'')', table_name);
    execute format('create policy "Admins can delete %1$s" on public.%1$I as permissive for delete to authenticated using (public.current_app_role() = ''admin'')', table_name);
    execute format('create policy "Only admins may insert %1$s" on public.%1$I as restrictive for insert to authenticated with check (public.current_app_role() = ''admin'')', table_name);
    execute format('create policy "Only admins may update %1$s" on public.%1$I as restrictive for update to authenticated using (public.current_app_role() = ''admin'') with check (public.current_app_role() = ''admin'')', table_name);
    execute format('create policy "Only admins may delete %1$s" on public.%1$I as restrictive for delete to authenticated using (public.current_app_role() = ''admin'')', table_name);
  end loop;
end
$$;
