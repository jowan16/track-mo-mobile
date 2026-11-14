-- Shared default category administration, custom icon storage, and live sync.

-- Let active administrators manage shared default categories. Existing
-- owner-only policies remain in place for user-owned custom categories.
DROP POLICY IF EXISTS "Admins can insert default categories" ON public.categories;
CREATE POLICY "Admins can insert default categories"
ON public.categories FOR INSERT TO authenticated
WITH CHECK (public.is_current_user_admin() AND user_id IS NULL);

DROP POLICY IF EXISTS "Admins can update default categories" ON public.categories;
CREATE POLICY "Admins can update default categories"
ON public.categories FOR UPDATE TO authenticated
USING (public.is_current_user_admin() AND user_id IS NULL)
WITH CHECK (public.is_current_user_admin() AND user_id IS NULL);

-- Do not hard-delete categories: expenses, budgets, and user_categories
-- reference them. The application soft-deletes by setting is_active=false.
DROP POLICY IF EXISTS "Admins can upload category icon assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update category icon assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete category icon assets" ON storage.objects;
DROP POLICY IF EXISTS "Public can read category icon assets" ON storage.objects;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('category-icons', 'category-icons', true, 2097152,
        ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 2097152,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Admins can upload category icon assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'category-icons' AND public.is_current_user_admin());

CREATE POLICY "Admins can update category icon assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'category-icons' AND public.is_current_user_admin())
WITH CHECK (bucket_id = 'category-icons' AND public.is_current_user_admin());

CREATE POLICY "Admins can delete category icon assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'category-icons' AND public.is_current_user_admin());

-- Category icons are public, non-sensitive UI assets.
CREATE POLICY "Public can read category icon assets"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'category-icons');

-- Enable Postgres Changes so user screens receive category edits live.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
  END IF;
END
$$;
