REVOKE ALL ON FUNCTION public.touch_last_active() FROM anon;
GRANT EXECUTE ON FUNCTION public.touch_last_active() TO authenticated;
