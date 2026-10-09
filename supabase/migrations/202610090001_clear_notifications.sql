grant delete on public.app_notifications to authenticated;

create policy "Users clear their own notifications" on public.app_notifications
  for delete to authenticated
  using (recipient_id = auth.uid() or recipient_role = public.current_app_role());
