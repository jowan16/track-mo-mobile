create trigger profiles_budget_alert_preferences_trigger
after update of email_alerts, warn_80, warn_100
on public.profiles
for each row
when (
  old.email_alerts is distinct from new.email_alerts
  or old.warn_80 is distinct from new.warn_80
  or old.warn_100 is distinct from new.warn_100
)
execute function public.notify_budget_alert();