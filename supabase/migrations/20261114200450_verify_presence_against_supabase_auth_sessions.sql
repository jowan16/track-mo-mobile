-- Only count sessions that still exist in Supabase Auth, not just recent client heartbeats.
CREATE OR REPLACE FUNCTION public.touch_last_active()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_session_id uuid := NULLIF((SELECT auth.jwt() ->> 'session_id'), '')::uuid;
  v_expires_at timestamptz := CASE
    WHEN NULLIF((SELECT auth.jwt() ->> 'exp'), '') IS NULL THEN NULL
    ELSE pg_catalog.to_timestamp(((SELECT auth.jwt() ->> 'exp'))::double precision)
  END;
  v_last_seen_at timestamptz;
BEGIN
  IF v_user_id IS NULL OR v_session_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated session required';
  END IF;

  INSERT INTO public.user_activity_sessions
    (session_id, user_id, last_seen_at, token_expires_at, updated_at)
  SELECT v_session_id, p.id, pg_catalog.now(), v_expires_at, pg_catalog.now()
  FROM public.profiles p
  WHERE p.id = v_user_id
    AND lower(btrim(p.status)) = 'active'
    AND EXISTS (
      SELECT 1
      FROM auth.sessions auth_session
      WHERE auth_session.id = v_session_id
        AND auth_session.user_id = v_user_id
        AND (auth_session.not_after IS NULL OR auth_session.not_after > pg_catalog.now())
    )
  ON CONFLICT (session_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        last_seen_at = EXCLUDED.last_seen_at,
        token_expires_at = EXCLUDED.token_expires_at,
        updated_at = EXCLUDED.updated_at
    WHERE public.user_activity_sessions.user_id = EXCLUDED.user_id
  RETURNING last_seen_at INTO v_last_seen_at;

  IF v_last_seen_at IS NULL THEN
    RAISE EXCEPTION 'Active authenticated session required';
  END IF;

  UPDATE public.profiles
  SET last_seen_at = v_last_seen_at
  WHERE id = v_user_id;

  DELETE FROM public.user_activity_sessions
  WHERE last_seen_at < pg_catalog.now() - interval '5 minutes'
     OR (token_expires_at IS NOT NULL AND token_expires_at < pg_catalog.now() - interval '5 minutes');

  RETURN v_last_seen_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_user_activity_sessions()
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  last_seen_at timestamptz,
  token_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  RETURN QUERY
  SELECT activity.session_id, activity.user_id, activity.last_seen_at, activity.token_expires_at
  FROM public.user_activity_sessions activity
  INNER JOIN auth.sessions auth_session
    ON auth_session.id = activity.session_id
   AND auth_session.user_id = activity.user_id
  INNER JOIN public.profiles profile
    ON profile.id = activity.user_id
  WHERE lower(btrim(profile.status)) = 'active'
    AND activity.last_seen_at >= pg_catalog.now() - interval '90 seconds'
    AND (activity.token_expires_at IS NULL OR activity.token_expires_at > pg_catalog.now())
    AND (auth_session.not_after IS NULL OR auth_session.not_after > pg_catalog.now());
END;
$$;

REVOKE ALL ON FUNCTION public.touch_last_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_last_active() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_get_user_activity_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_activity_sessions() TO authenticated;
