DROP POLICY IF EXISTS "Require active account for receipt storage" ON storage.objects;
CREATE POLICY "Require active account for receipt storage"
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (bucket_id <> 'receipts' OR (SELECT public.is_active_user()))
WITH CHECK (bucket_id <> 'receipts' OR (SELECT public.is_active_user()));
