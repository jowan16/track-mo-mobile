CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS TABLE(
  total_users bigint,
  active_users bigint,
  admins bigint,
  expenses_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE p.role = 'user'),
    COUNT(*) FILTER (
      WHERE p.role = 'user'
        AND lower(btrim(p.status)) = 'active'
    ),
    COUNT(*) FILTER (WHERE p.role = 'admin'),
    (
      SELECT COUNT(*)
      FROM public.expenses AS e
      WHERE COALESCE(e.is_archived, false) = false
    )
  FROM public.profiles AS p;
END;
$function$;