DROP POLICY IF EXISTS "claim own role" ON public.user_roles;
CREATE POLICY "claim own patient role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role = 'patient'::app_role);