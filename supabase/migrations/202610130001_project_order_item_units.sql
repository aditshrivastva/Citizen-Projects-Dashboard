alter table public.project_order_items
  drop constraint if exists project_order_items_unit_check;

alter table public.project_order_items
  add constraint project_order_items_unit_check check (length(trim(unit)) > 0);