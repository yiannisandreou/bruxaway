DROP POLICY IF EXISTS "physician creates own links" ON public.care_links;
CREATE POLICY "physician creates own links" ON public.care_links
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = physician_id AND has_role(auth.uid(), 'physician'::app_role) AND has_role(patient_id, 'patient'::app_role));