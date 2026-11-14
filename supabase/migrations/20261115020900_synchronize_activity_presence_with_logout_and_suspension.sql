CREATE OR REPLACE FUNCTION public.end_last_active_session()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- The app's existing signOut() uses Supabase's default global sign-out scope,
  -- so all sessions for this account are revoked and all presence rows are ended.
  DELETE FROM public.user_activity_sessions
  WHERE user_id = v_user_id;

  UPDATE public.profiles
  SET last_seen_at = pg_catalog.now()
  WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.end_last_active_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_last_active_session() TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_suspended_user_presence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF lower(btrim(NEW.status)) = 'suspended'
     AND lower(btrim(OLD.status)) IS DISTINCT FROM 'suspended' THEN
    DELETE FROM public.user_activity_sessions WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_suspended_user_presence_trigger ON public.profiles;
CREATE TRIGGER clear_suspended_user_presence_trigger
AFTER UPDATE OF status ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.clear_suspended_user_presence();

REVOKE ALL ON FUNCTION public.clear_suspended_user_presence() FROM PUBLIC, anon, authenticated;
