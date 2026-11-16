-- Track each authenticated Supabase session independently.
CREATE TABLE IF NOT EXISTS public.user_activity_sessions (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  token_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_activity_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read activity sessions" ON public.user_activity_sessions;
CREATE POLICY "Admins can read activity sessions"
  ON public.user_activity_sessions
  FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

REVOKE ALL ON TABLE public.user_activity_sessions FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_activity_sessions TO authenticated;

CREATE INDEX IF NOT EXISTS user_activity_sessions_user_id_idx
  ON public.user_activity_sessions(user_id);

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
  WHERE p.id = v_user_id AND lower(btrim(p.status)) = 'active'
  ON CONFLICT (session_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        last_seen_at = EXCLUDED.last_seen_at,
        token_expires_at = EXCLUDED.token_expires_at,
        updated_at = EXCLUDED.updated_at
    WHERE public.user_activity_sessions.user_id = EXCLUDED.user_id
  RETURNING last_seen_at INTO v_last_seen_at;

  IF v_last_seen_at IS NULL THEN
    RAISE EXCEPTION 'Active account and valid session required';
  END IF;

  UPDATE public.profiles
  SET last_seen_at = v_last_seen_at
  WHERE id = v_user_id;

  RETURN v_last_seen_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_last_active_session()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_session_id uuid := NULLIF((SELECT auth.jwt() ->> 'session_id'), '')::uuid;
BEGIN
  IF v_user_id IS NULL OR v_session_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.user_activity_sessions
  WHERE session_id = v_session_id AND user_id = v_user_id;

  UPDATE public.profiles
  SET last_seen_at = pg_catalog.now()
  WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_last_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_last_active() TO authenticated;
REVOKE ALL ON FUNCTION public.end_last_active_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_last_active_session() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_activity_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activity_sessions;
  END IF;
END
$$;

DELETE FROM public.user_activity_sessions
WHERE last_seen_at < pg_catalog.now() - interval '5 minutes'
   OR (token_expires_at IS NOT NULL AND token_expires_at < pg_catalog.now() - interval '5 minutes');
