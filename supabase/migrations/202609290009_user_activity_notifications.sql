create or replace function public.notify_admin_of_user_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_project_id uuid;
  project_title text;
  actor_label text;
  module_title text;
  module_path text;
  event_title text;
  action_label text;
begin
  -- Admin work is tracked by the existing project update notifications.
  if public.current_app_role() <> 'user' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'DELETE' then
    target_project_id := old.project_id;
  else
    target_project_id := new.project_id;
  end if;

  case tg_table_name
    when 'measurements' then module_title := 'measurement'; module_path := 'measurements';
    when 'items' then module_title := 'item'; module_path := 'items';
    when 'transports' then module_title := 'transport record'; module_path := 'transport';
    when 'labour_records' then module_title := 'labour record'; module_path := 'labour';
    when 'project_bills' then module_title := 'bill'; module_path := 'billing';
    when 'project_payments' then module_title := 'payment'; module_path := 'payments';
    else module_title := 'project record'; module_path := '';
  end case;

  action_label := case tg_op
    when 'INSERT' then 'added'
    when 'UPDATE' then 'updated'
    when 'DELETE' then 'deleted'
    else 'changed'
  end;
  event_title := initcap(module_title) || ' ' || initcap(action_label);

  select project_name into project_title
  from public.projects where id = target_project_id;

  select coalesce(
    nullif(raw_user_meta_data ->> 'full_name', ''),
    nullif(raw_user_meta_data ->> 'name', ''),
    email,
    'A user'
  ) into actor_label
  from auth.users where id = auth.uid();

  insert into public.app_notifications (recipient_role, project_id, title, message, href)
  values (
    'admin',
    target_project_id,
    event_title,
    coalesce(actor_label, 'A user') || ' ' || action_label || ' ' || module_title ||
      ' in ' || coalesce(project_title, 'a project') || '.',
    '/dashboard/projects/' || target_project_id::text || '/' || module_path
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'measurements', 'items', 'transports', 'labour_records', 'project_bills', 'project_payments'
  ] loop
    execute format('drop trigger if exists notify_admin_of_user_activity on public.%I', table_name);
    execute format(
      'create trigger notify_admin_of_user_activity after insert or update or delete on public.%I for each row execute function public.notify_admin_of_user_activity()',
      table_name
    );
  end loop;
end
$$;
