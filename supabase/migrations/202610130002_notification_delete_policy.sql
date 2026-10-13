grant delete on public.app_notifications to authenticated;

drop policy if exists "Users clear their own notifications" on public.app_notifications;
create policy "Users clear their own notifications" on public.app_notifications
  for delete to authenticated
  using (
    recipient_id = (select auth.uid())
    or (
      recipient_role = 'admin'
      and public.current_app_role() = 'admin'
    )
  );
