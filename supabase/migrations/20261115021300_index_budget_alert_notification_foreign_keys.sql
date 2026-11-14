create index if not exists budget_alert_notifications_budget_id_idx
  on public.budget_alert_notifications (budget_id);

create index if not exists budget_alert_notifications_category_id_idx
  on public.budget_alert_notifications (category_id);
