CREATE POLICY "physician reads linked patient prompt events"
ON public.prompt_events
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'physician'::app_role) AND is_care_linked(auth.uid(), user_id));