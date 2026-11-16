-- Track the most recent foreground activity for each account.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Clients cannot choose or spoof the timestamp. The database writes its own time
-- and only permits the authenticated user to update their own active profile.
CREATE OR REPLACE FUNCTION public.touch_last_active()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_last_seen_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.profiles
  SET last_seen_at = pg_catalog.now()
  WHERE id = v_user_id
    AND lower(btrim(status)) = 'active'
  RETURNING last_seen_at INTO v_last_seen_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active account required';
  END IF;

  RETURN v_last_seen_at;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_last_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_last_active() TO authenticated;
