-- 1) Prevent self-promotion to the physician role.
DROP POLICY IF EXISTS "claim own role" ON public.user_roles;
CREATE POLICY "claim own patient role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role = 'patient'::public.app_role);

-- 2) Care links: allow a verified physician to create their own links.
DROP POLICY IF EXISTS "physician creates own links" ON public.care_links;
CREATE POLICY "physician creates own links" ON public.care_links
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = physician_id
    AND public.has_role(auth.uid(), 'physician'::public.app_role)
    AND public.has_role(patient_id, 'patient'::public.app_role)
  );
GRANT INSERT ON public.care_links TO authenticated;

-- 3) SECURITY DEFINER functions: no anon access at all; the cron-only helper is
--    service_role only. has_role/is_care_linked must stay callable by
--    authenticated because RLS policies evaluate them as the calling role.
REVOKE ALL ON FUNCTION public.eligible_prompt_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eligible_prompt_users() TO service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_care_linked(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_care_linked(uuid, uuid) TO authenticated, service_role;

-- 4) prompt_events are created only by the scheduler (service role); keep users
--    from forging or deleting their own prompt history.
REVOKE INSERT, DELETE ON public.prompt_events FROM authenticated;