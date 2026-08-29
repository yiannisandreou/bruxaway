DROP POLICY IF EXISTS "claim own patient role" ON public.user_roles;
CREATE POLICY "claim own role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "physician creates own links" ON public.care_links;
CREATE POLICY "physician creates own links" ON public.care_links
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = physician_id AND has_role(auth.uid(), 'physician'::app_role));