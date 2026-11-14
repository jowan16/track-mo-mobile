-- Restore the System Reports RPC contract that existed before the latest
-- accuracy/export enhancement. Preserve the earlier system-wide admin fix.
DROP FUNCTION IF EXISTS public.admin_period_currency_totals(date, date);
DROP FUNCTION IF EXISTS public.admin_period_expenses(date, date);

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
      FROM public.profiles p
      WHERE p.role = 'user'
        AND p.created_at >= p_start
        AND p.created_at < p_end
    ),
    (
      SELECT COUNT(*)::BIGINT
      FROM public.expenses e
      WHERE e.spent_on >= p_start
        AND e.spent_on < p_end
        AND e.is_archived = false
    ),
    (
      SELECT COUNT(*)::BIGINT
      FROM public.profiles p
      WHERE p.role = 'user'
        AND p.status = 'active'
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_period_stats(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_period_stats(date, date) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_top_categories(date, date);
CREATE FUNCTION public.admin_top_categories(p_start date, p_end date)
RETURNS TABLE(category_id bigint, uses bigint)
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
    e.category_id,
    COUNT(*)::BIGINT AS uses
  FROM public.expenses e
  WHERE e.spent_on >= p_start
    AND e.spent_on < p_end
    AND e.is_archived = false
    AND e.category_id IS NOT NULL
  GROUP BY e.category_id
  ORDER BY uses DESC
  LIMIT 5;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_top_categories(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_top_categories(date, date) TO authenticated;
