-- Preserve already-notified states, but allow a first alert for an already-crossed
-- threshold that has never been emailed before this deployment.
with budget_totals as (
  select
    b.id as budget_id,
    b.amount,
    coalesce(sum(e.amount) filter (where e.is_archived = false), 0) as spent
  from public.budgets b
  left join public.expenses e
    on e.user_id = b.user_id
   and e.category_id = b.category_id
   and e.spent_on >= make_date(b.year::int, b.month::int, 1)
   and e.spent_on < (make_date(b.year::int, b.month::int, 1) + interval '1 month')::date
  where b.is_archived = false and b.amount > 0
  group by b.id, b.amount
),
state_values as (
  select
    bt.budget_id,
    thresholds.threshold,
    ((bt.spent / bt.amount * 100) >= thresholds.threshold
      and exists (
        select 1
        from public.email_notification_logs l
        where l.budget_id = bt.budget_id
          and l.threshold = thresholds.threshold
          and l.notification_type = 'budget_alert'
      )) as is_above,
    (select count(*)::bigint
       from public.email_notification_logs l
      where l.budget_id = bt.budget_id
        and l.threshold = thresholds.threshold
        and l.notification_type = 'budget_alert') as crossing_count
  from budget_totals bt
  cross join (values (80::smallint), (100::smallint)) as thresholds(threshold)
)
update public.budget_alert_threshold_state s
   set is_above = v.is_above,
       crossing_count = v.crossing_count,
       updated_at = now()
  from state_values v
 where s.budget_id = v.budget_id
   and s.threshold = v.threshold;
