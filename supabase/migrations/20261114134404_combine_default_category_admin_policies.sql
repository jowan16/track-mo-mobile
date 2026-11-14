-- Combine owner and administrator category write permissions into one policy
-- per command, avoiding duplicate permissive policies.
DROP POLICY IF EXISTS "Admins can insert default categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can update default categories" ON public.categories;

DROP POLICY IF EXISTS "categories insert own" ON public.categories;
CREATE POLICY "categories insert own"
ON public.categories FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  OR (user_id IS NULL AND public.is_current_user_admin())
);

DROP POLICY IF EXISTS "categories update own" ON public.categories;
CREATE POLICY "categories update own"
ON public.categories FOR UPDATE TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  OR (user_id IS NULL AND public.is_current_user_admin())
)
WITH CHECK (
  (SELECT auth.uid()) = user_id
  OR (user_id IS NULL AND public.is_current_user_admin())
);
