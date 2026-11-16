-- Track budget threshold state so emails are sent only on genuine crossings.
alter table public.email_notification_logs
  add column if not exists alert_cycle bigint not null default 1;

drop index if exists public.email_notification_budget_unique;

create unique index if not exists email_notification_budget_cycle_unique
  on public.email_notification_logs (user_id, budget_id, threshold, alert_cycle)
  where notification_type = 'budget_alert';

create table if not exists public.budget_alert_threshold_state (
  budget_id uuid not null references public.budgets(id) on delete cascade,
  threshold smallint not null check (threshold in (80, 100)),
  is_above boolean not null default false,
  crossing_count bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (budget_id, threshold)
);

alter table public.budget_alert_threshold_state enable row level security;
revoke all on public.budget_alert_threshold_state from anon, authenticated;
grant all on public.budget_alert_threshold_state to service_role;

with budget_totals as (
  select
    b.id as budget_id,
    b.user_id,
    b.amount,
    coalesce(sum(e.amount) filter (where e.is_archived = false), 0) as spent
  from public.budgets b
  left join public.expenses e
    on e.user_id = b.user_id
   and e.category_id = b.category_id
   and e.spent_on >= make_date(b.year::int, b.month::int, 1)
   and e.spent_on < (make_date(b.year::int, b.month::int, 1) + interval '1 month')::date
  where b.is_archived = false and b.amount > 0
  group by b.id, b.user_id, b.amount
),
existing_alerts as (
  select budget_id, threshold, count(*)::bigint as sent_count
  from public.email_notification_logs
  where notification_type = 'budget_alert'
  group by budget_id, threshold
),
seed_rows as (
  select
    bt.budget_id,
    thresholds.threshold,
    (bt.spent / bt.amount * 100) >= thresholds.threshold as is_above,
    coalesce(ea.sent_count, 0) as crossing_count
  from budget_totals bt
  cross join (values (80::smallint), (100::smallint)) as thresholds(threshold)
  left join existing_alerts ea
    on ea.budget_id = bt.budget_id and ea.threshold = thresholds.threshold
)
insert into public.budget_alert_threshold_state
  (budget_id, threshold, is_above, crossing_count)
select budget_id, threshold, is_above, crossing_count
from seed_rows
on conflict (budget_id, threshold) do nothing;

create or replace function public.claim_budget_alert_crossing(
  p_budget_id uuid,
  p_threshold smallint,
  p_percentage numeric,
  p_force boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.budget_alert_threshold_state%rowtype;
  v_is_above boolean;
begin
  if p_threshold not in (80, 100) then
    raise exception 'Unsupported budget alert threshold: %', p_threshold;
  end if;

  v_is_above := coalesce(p_percentage, 0) >= p_threshold;

  insert into public.budget_alert_threshold_state
    (budget_id, threshold, is_above, crossing_count)
  values (p_budget_id, p_threshold, false, 0)
  on conflict (budget_id, threshold) do nothing;

  select *
    into v_state
    from public.budget_alert_threshold_state
   where budget_id = p_budget_id
     and threshold = p_threshold
   for update;

  if v_is_above and (not v_state.is_above or coalesce(p_force, false)) then
    update public.budget_alert_threshold_state
       set is_above = true,
           crossing_count = crossing_count + 1,
           updated_at = now()
     where budget_id = p_budget_id
       and threshold = p_threshold
    returning crossing_count into v_state.crossing_count;

    return v_state.crossing_count;
  end if;

  update public.budget_alert_threshold_state
     set is_above = v_is_above,
         updated_at = now()
   where budget_id = p_budget_id
     and threshold = p_threshold;

  return null;
end;
$$;

revoke all on function public.claim_budget_alert_crossing(uuid, smallint, numeric, boolean) from public, anon, authenticated;
grant execute on function public.claim_budget_alert_crossing(uuid, smallint, numeric, boolean) to service_role;

drop trigger if exists budgets_budget_alert_trigger on public.budgets;
create trigger budgets_budget_alert_trigger
after insert or update of amount, category_id, month, year, is_archived
on public.budgets
for each row
execute function public.notify_budget_alert();
