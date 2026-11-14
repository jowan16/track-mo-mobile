-- Persist category-specific in-app budget alerts and delivery outcomes.
create table if not exists public.budget_alert_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  category_id bigint not null references public.categories(id) on delete cascade,
  threshold smallint not null check (threshold in (80, 100)),
  alert_cycle bigint not null,
  budget_month smallint not null check (budget_month between 1 and 12),
  budget_year smallint not null,
  budget_amount numeric(14,2) not null,
  spent_amount numeric(14,2) not null,
  remaining_amount numeric(14,2) not null,
  percentage numeric(8,2) not null,
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint budget_alert_notifications_cycle_unique
    unique (user_id, budget_id, threshold, alert_cycle)
);

create index if not exists budget_alert_notifications_user_created_idx
  on public.budget_alert_notifications (user_id, created_at desc);

alter table public.budget_alert_notifications enable row level security;
revoke all on public.budget_alert_notifications from anon, authenticated;
grant select on public.budget_alert_notifications to authenticated;
grant update (read_at) on public.budget_alert_notifications to authenticated;
grant all on public.budget_alert_notifications to service_role;

drop policy if exists "Users can read their own budget alert notifications"
  on public.budget_alert_notifications;
create policy "Users can read their own budget alert notifications"
  on public.budget_alert_notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_active_user());

drop policy if exists "Users can mark their own budget alerts as read"
  on public.budget_alert_notifications;
create policy "Users can mark their own budget alerts as read"
  on public.budget_alert_notifications
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_active_user())
  with check (user_id = (select auth.uid()) and public.is_active_user());

-- Keep email delivery state separate from threshold-crossing state. Failed sends
-- can be retried on a later budget event without generating duplicate in-app alerts.
alter table public.email_notification_logs
  add column if not exists delivery_status text not null default 'sent',
  add column if not exists delivery_error text,
  add column if not exists attempt_count integer not null default 1,
  add column if not exists last_attempt_at timestamptz not null default now(),
  add column if not exists delivered_at timestamptz;

update public.email_notification_logs
set delivered_at = sent_at
where delivery_status = 'sent' and delivered_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_notification_logs_delivery_status_check'
      and conrelid = 'public.email_notification_logs'::regclass
  ) then
    alter table public.email_notification_logs
      add constraint email_notification_logs_delivery_status_check
      check (delivery_status in ('pending', 'sent', 'failed'));
  end if;
end;
$$;

-- The database webhook invokes this RPC with the service-role JWT. User-facing
-- callers remain subject to active-account and ownership checks.
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
as $function$
declare
  v_state public.budget_alert_threshold_state%rowtype;
  v_is_above boolean;
  v_jwt_role text;
begin
  v_jwt_role := coalesce(
    (select auth.jwt() ->> 'role'),
    current_setting('request.jwt.claim.role', true),
    ''
  );

  if p_threshold not in (80, 100) then
    raise exception 'Unsupported budget alert threshold: %', p_threshold;
  end if;

  if v_jwt_role = 'service_role' then
    if not exists (
      select 1
      from public.budgets b
      join public.profiles p on p.id = b.user_id
      where b.id = p_budget_id
        and lower(btrim(p.status)) = 'active'
    ) then
      return null;
    end if;
  else
    if not public.is_active_user() then
      raise exception 'Active account required';
    end if;

    if not exists (
      select 1
      from public.budgets
      where id = p_budget_id
        and user_id = (select auth.uid())
    ) then
      raise exception 'Budget not found';
    end if;
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
$function$;

revoke all on function public.claim_budget_alert_crossing(uuid, smallint, numeric, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_budget_alert_crossing(uuid, smallint, numeric, boolean)
  to service_role, postgres;

-- Expense deletion is also a spending decrease and must reset threshold state.
create or replace function public.notify_budget_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_project_url text;
  v_secret_key text;
  v_record jsonb;
  v_old_record jsonb;
begin
  if tg_op = 'DELETE' then
    v_record := to_jsonb(old);
  else
    v_record := to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' then
    v_old_record := to_jsonb(old);
  end if;

  select decrypted_secret
    into v_project_url
  from vault.decrypted_secrets
  where name = 'project_url';

  select decrypted_secret
    into v_secret_key
  from vault.decrypted_secrets
  where name = 'secret_key';

  if v_project_url is null or v_secret_key is null then
    raise warning 'Budget alert webhook credentials are missing.';
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  perform net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/budget-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_secret_key
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', v_record,
      'old_record', v_old_record
    ),
    timeout_milliseconds := 5000
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists expenses_budget_alert_trigger on public.expenses;
create trigger expenses_budget_alert_trigger
  after insert or update or delete on public.expenses
  for each row execute function public.notify_budget_alert();

drop trigger if exists budgets_budget_alert_trigger on public.budgets;
create trigger budgets_budget_alert_trigger
  after insert or update or delete on public.budgets
  for each row execute function public.notify_budget_alert();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'budget_alert_notifications'
  ) then
    alter publication supabase_realtime
      add table public.budget_alert_notifications;
  end if;
end;
$$;
