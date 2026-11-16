-- Enforce account suspension at the database layer, not only during login.
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND lower(btrim(status)) = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;

-- Restrictive policies add an account-status requirement to existing ownership
-- and administrator policies without replacing their current rules.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'archives', 'audit_log', 'budget_alert_threshold_state', 'budgets',
    'categories', 'email_notification_logs', 'expense_receipt_items',
    'expense_receipts', 'expenses', 'lessons', 'user_categories'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Require active account', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.is_active_user())) WITH CHECK ((SELECT public.is_active_user()))',
      'Require active account', v_table
    );
  END LOOP;
END
$$;

-- Keep profile SELECT available so the app can identify and explain suspension.
-- Profile updates are additionally blocked for suspended users.
DROP POLICY IF EXISTS "Require active account for profile updates" ON public.profiles;
CREATE POLICY "Require active account for profile updates"
ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
USING ((SELECT public.is_active_user()))
WITH CHECK ((SELECT public.is_active_user()));

-- Clients may update only self-service fields, never role or account status.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  full_name, currency, warn_80, warn_100, email_alerts,
  daily_reminder, daily_reminder_time, daily_reminder_timezone
) ON public.profiles TO authenticated;

-- Revoke refresh sessions when suspending. RLS above also blocks requests made
-- with any already-issued access token.
CREATE OR REPLACE FUNCTION public.admin_set_account_status(
  p_target_user_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target_role text;
  v_target_status text;
  v_active_admin_count bigint;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_target_user_id IS NULL OR p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Invalid account status';
  END IF;

  PERFORM pg_advisory_xact_lock(123456789);

  SELECT role, status INTO v_target_role, v_target_status
  FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF p_target_user_id = (SELECT auth.uid()) AND p_status = 'suspended' THEN
    RAISE EXCEPTION 'You cannot suspend your own account';
  END IF;

  IF v_target_role = 'admin' AND v_target_status = 'active' AND p_status = 'suspended' THEN
    SELECT count(*) INTO v_active_admin_count
    FROM public.profiles
    WHERE role = 'admin' AND status = 'active' AND id <> p_target_user_id;
    IF v_active_admin_count = 0 THEN
      RAISE EXCEPTION 'Cannot suspend the last active administrator';
    END IF;
  END IF;

  UPDATE public.profiles SET status = p_status WHERE id = p_target_user_id;

  IF p_status = 'suspended' THEN
    DELETE FROM auth.sessions WHERE user_id = p_target_user_id;
  END IF;
END;
$$;

-- Keep the legacy user-only status RPC consistent with the main RPC.
CREATE OR REPLACE FUNCTION public.admin_set_account_active(
  p_target_user_id uuid,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target_role text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_target_user_id IS NULL OR p_is_active IS NULL THEN
    RAISE EXCEPTION 'Invalid account status request';
  END IF;

  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_target_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF v_target_role <> 'user' THEN
    RAISE EXCEPTION 'This operation only supports user accounts';
  END IF;
  IF p_target_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'You cannot change your own account status';
  END IF;

  PERFORM public.admin_set_account_status(
    p_target_user_id,
    CASE WHEN p_is_active THEN 'active' ELSE 'suspended' END
  );
END;
$$;

-- SECURITY DEFINER alert RPCs must enforce the same account and ownership rules.
CREATE OR REPLACE FUNCTION public.claim_budget_alert_crossing(
  p_budget_id uuid,
  p_threshold smallint,
  p_percentage numeric,
  p_force boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state public.budget_alert_threshold_state%rowtype;
  v_is_above boolean;
BEGIN
  IF NOT public.is_active_user() THEN RAISE EXCEPTION 'Active account required'; END IF;
  IF p_threshold NOT IN (80, 100) THEN
    RAISE EXCEPTION 'Unsupported budget alert threshold: %', p_threshold;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.budgets
    WHERE id = p_budget_id AND user_id = (SELECT auth.uid())
  ) THEN RAISE EXCEPTION 'Budget not found'; END IF;

  v_is_above := coalesce(p_percentage, 0) >= p_threshold;

  INSERT INTO public.budget_alert_threshold_state
    (budget_id, threshold, is_above, crossing_count)
  VALUES (p_budget_id, p_threshold, false, 0)
  ON CONFLICT (budget_id, threshold) DO NOTHING;

  SELECT * INTO v_state
  FROM public.budget_alert_threshold_state
  WHERE budget_id = p_budget_id AND threshold = p_threshold
  FOR UPDATE;

  IF v_is_above AND (NOT v_state.is_above OR coalesce(p_force, false)) THEN
    UPDATE public.budget_alert_threshold_state
    SET is_above = true, crossing_count = crossing_count + 1, updated_at = now()
    WHERE budget_id = p_budget_id AND threshold = p_threshold
    RETURNING crossing_count INTO v_state.crossing_count;
    RETURN v_state.crossing_count;
  END IF;

  UPDATE public.budget_alert_threshold_state
  SET is_above = v_is_above, updated_at = now()
  WHERE budget_id = p_budget_id AND threshold = p_threshold;
  RETURN NULL;
END;
$$;
