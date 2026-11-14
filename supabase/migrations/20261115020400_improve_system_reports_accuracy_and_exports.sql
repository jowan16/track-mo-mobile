-- Improve System Reports: Manila calendar boundaries, per-currency totals,
-- complete transaction exports, and accurate category shares.
-- All report RPCs require an active administrator and bypass per-user RLS
-- only after that authorization check.

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
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RAISE EXCEPTION 'Invalid report date range';
  END IF;

  RETURN QUERY
  SELECT
    (
      SELECT COUNT(*)::BIGINT
      FROM public.profiles p
      WHERE p.role = 'user'
        AND p.created_at >= (p_start::timestamp AT TIME ZONE 'Asia/Manila')
        AND p.created_at < (p_end::timestamp AT TIME ZONE 'Asia/Manila')
    ),
    (
      SELECT COUNT(*)::BIGINT
      FROM public.expenses e
      WHERE e.spent_on >= p_start
        AND e.spent_on < p_end
        AND e.is_archived IS FALSE
    ),
    (
      SELECT COUNT(*)::BIGINT
      FROM public.profiles p
      WHERE p.role = 'user'
        AND lower(btrim(p.status)) = 'active'
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_period_stats(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_period_stats(date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_period_currency_totals(p_start date, p_end date)
RETURNS TABLE(currency_code text, total_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RAISE EXCEPTION 'Invalid report date range';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(NULLIF(upper(btrim(p.currency)), ''), 'UNSPECIFIED')::text,
    COALESCE(SUM(e.amount), 0)::numeric
  FROM public.expenses e
  JOIN public.profiles p ON p.id = e.user_id
  WHERE e.spent_on >= p_start
    AND e.spent_on < p_end
    AND e.is_archived IS FALSE
  GROUP BY COALESCE(NULLIF(upper(btrim(p.currency)), ''), 'UNSPECIFIED')
  ORDER BY 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_period_currency_totals(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_period_currency_totals(date, date) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_top_categories(date, date);
CREATE FUNCTION public.admin_top_categories(p_start date, p_end date)
RETURNS TABLE(
  category_id bigint,
  category_name text,
  category_icon text,
  category_color text,
  uses bigint,
  percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RAISE EXCEPTION 'Invalid report date range';
  END IF;

  RETURN QUERY
  WITH category_counts AS (
    SELECT
      c.id,
      c.name,
      c.icon,
      c.color,
      COUNT(*)::BIGINT AS usage_count
    FROM public.expenses e
    JOIN public.categories c ON c.id = e.category_id
    WHERE e.spent_on >= p_start
      AND e.spent_on < p_end
      AND e.is_archived IS FALSE
      AND e.category_id IS NOT NULL
    GROUP BY c.id, c.name, c.icon, c.color
  )
  SELECT
    cc.id,
    cc.name::text,
    COALESCE(cc.icon, '')::text,
    COALESCE(cc.color, '')::text,
    cc.usage_count,
    ROUND(
      cc.usage_count::numeric * 100
      / NULLIF(SUM(cc.usage_count) OVER (), 0),
      2
    )
  FROM category_counts cc
  ORDER BY cc.usage_count DESC, cc.name ASC
  LIMIT 5;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_top_categories(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_top_categories(date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_period_expenses(p_start date, p_end date)
RETURNS TABLE(
  expense_id uuid,
  spent_on date,
  amount numeric,
  currency_code text,
  category_name text,
  payment_method text,
  note text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RAISE EXCEPTION 'Invalid report date range';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.spent_on,
    e.amount,
    COALESCE(NULLIF(upper(btrim(p.currency)), ''), 'UNSPECIFIED')::text,
    COALESCE(c.name, 'Uncategorized')::text,
    COALESCE(e.payment_method, '')::text,
    COALESCE(e.note, '')::text,
    e.created_at
  FROM public.expenses e
  JOIN public.profiles p ON p.id = e.user_id
  LEFT JOIN public.categories c ON c.id = e.category_id
  WHERE e.spent_on >= p_start
    AND e.spent_on < p_end
    AND e.is_archived IS FALSE
  ORDER BY e.spent_on DESC, e.created_at DESC, e.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_period_expenses(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_period_expenses(date, date) TO authenticated;

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
    FROM public.profiles p
    WHERE p.role = 'user'
      AND p.created_at < ((month_start + INTERVAL '1 month')::timestamp AT TIME ZONE 'Asia/Manila');
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_user_growth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_growth() TO authenticated;
