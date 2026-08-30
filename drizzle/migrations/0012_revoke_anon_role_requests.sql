-- No policy grants anon any access to clinician requests; drop the leftover privilege.
REVOKE ALL ON public.role_requests FROM anon;