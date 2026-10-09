create table public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references auth.users(id) on delete cascade,
  recipient_role text check (recipient_role in ('admin')),
  project_id uuid references public.projects(id) on delete cascade,
  title text not null,
  message text not null,
  href text not null default '/dashboard',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_has_recipient check (recipient_id is not null or recipient_role is not null)
);

create index app_notifications_recipient_created_idx
  on public.app_notifications (recipient_id, created_at desc);
create index app_notifications_role_created_idx
  on public.app_notifications (recipient_role, created_at desc);

alter table public.app_notifications enable row level security;
grant select on public.app_notifications to authenticated;
grant update (read_at) on public.app_notifications to authenticated;

create policy "Users read their own notifications" on public.app_notifications
  for select to authenticated
  using (recipient_id = auth.uid() or recipient_role = public.current_app_role());
create policy "Users mark their own notifications read" on public.app_notifications
  for update to authenticated
  using (recipient_id = auth.uid() or recipient_role = public.current_app_role())
  with check (recipient_id = auth.uid() or recipient_role = public.current_app_role());

create or replace function public.notify_project_admin_updates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    insert into public.app_notifications (recipient_id, project_id, title, message, href)
    select access.user_id, new.id, 'Project updated',
      'An administrator updated ' || new.project_name || '.',
      '/dashboard/projects/' || new.id::text
    from public.site_access access
    where access.project_id = new.id;

    insert into public.app_notifications (recipient_role, project_id, title, message, href)
    values ('admin', new.id, 'Project updated',
      new.project_name || ' was updated.',
      '/dashboard/projects/' || new.id::text);
  end if;
  return new;
end
$$;

drop trigger if exists notify_project_admin_updates on public.projects;
create trigger notify_project_admin_updates
  after update on public.projects
  for each row
  when (public.current_app_role() = 'admin')
  execute function public.notify_project_admin_updates();
