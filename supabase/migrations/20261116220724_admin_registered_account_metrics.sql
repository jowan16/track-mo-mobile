-- Count registered accounts from Supabase Auth so admin accounts and any
-- auth users missing a profile are not silently omitted from account totals.
-- User-oriented metrics remain profile-based; only the total registered-account
-- metric includes every non-deleted Auth account. Existing admin guards remain.

CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS TABLE(total_users bigint, active_users bigint, admins bigint, expenses_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    (
      SELECT COUNT(*)::BIGINT
      FROM auth.users AS u
      WHERE u.deleted_at IS NULL
    ),
    (
      SELECT COUNT(*)::BIGINT
      FROM public.profiles AS p
      WHERE p.role = 'user'
        AND lower(btrim(p.status)) = 'active'
    ),
    (
      SELECT COUNT(*)::BIGINT
      FROM public.profiles AS p
      WHERE p.role = 'admin'
    ),
    (
      SELECT COUNT(*)::BIGINT
      FROM public.expenses AS e
      WHERE COALESCE(e.is_archived, false) = false
    );
END;
$function$;

-- New users remain regular-user profiles, using Manila date boundaries to match
-- the Reports screen. Profile-less Auth accounts are only part of total_users.
CREATE OR REPLACE FUNCTION public.admin_period_stats(p_start date, p_end date)
RETURNS TABLE(new_users bigint, expenses_count bigint, active_users bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    (
      SELECT COUNT(*)::BIGINT
      FROM public.profiles AS p
      WHERE p.role = 'user'
        AND p.created_at >= (p_start::timestamp AT TIME ZONE 'Asia/Manila')
        AND p.created_at < (p_end::timestamp AT TIME ZONE 'Asia/Manila')
    ),
    (
      SELECT COUNT(*)::BIGINT
      FROM public.expenses AS e
      WHERE e.spent_on >= p_start
        AND e.spent_on < p_end
        AND e.is_archived = false
    ),
    (
      SELECT COUNT(*)::BIGINT
      FROM public.profiles AS p
      WHERE p.role = 'user'
        AND lower(btrim(p.status)) = 'active'
    );
END;
$function$;

-- User growth represents cumulative regular-user profiles, using Manila month
-- boundaries and excluding Auth accounts that have no profile.
CREATE OR REPLACE FUNCTION public.admin_user_growth()
RETURNS TABLE(label text, total bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  month_start date;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  FOR month_start IN
    SELECT generate_series(
      date_trunc('month', now() AT TIME ZONE 'Asia/Manila')::date - INTERVAL '5 months',
      date_trunc('month', now() AT TIME ZONE 'Asia/Manila')::date,
      INTERVAL '1 month'
    )::date
  LOOP
    RETURN QUERY
    SELECT
      to_char(month_start, 'Mon YYYY')::text,
      COUNT(*)::bigint
    FROM public.profiles AS p
    WHERE p.role = 'user'
      AND p.created_at < ((month_start + INTERVAL '1 month')::timestamp AT TIME ZONE 'Asia/Manila');
  END LOOP;
END;
$function$;
