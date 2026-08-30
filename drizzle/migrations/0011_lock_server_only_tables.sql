-- cron_config and push_delivery_failures are trusted-server-only tables:
-- no client feature reads them, so keep them unreachable from the Data API.
REVOKE ALL ON public.cron_config FROM anon, authenticated;
REVOKE ALL ON public.push_delivery_failures FROM anon, authenticated;
GRANT ALL ON public.cron_config TO service_role;
GRANT ALL ON public.push_delivery_failures TO service_role;

COMMENT ON TABLE public.cron_config IS 'Server-only: cron bearer secret. Read by pg_cron and service_role code only; RLS fail-closed by design.';
COMMENT ON TABLE public.push_delivery_failures IS 'Server-only: push delivery failure log written by the cron route via service_role; RLS fail-closed by design.';

-- Clinician request review happens exclusively in server functions that verify
-- the caller is a physician before using the service role. Remove the unused
-- UPDATE privilege so no future policy can accidentally open client-side review.
REVOKE UPDATE, DELETE ON public.role_requests FROM anon, authenticated;
GRANT SELECT, INSERT ON public.role_requests TO authenticated;
GRANT ALL ON public.role_requests TO service_role;

COMMENT ON TABLE public.role_requests IS 'Clinician access requests. Users insert/read their own; approval/rejection is server-side only (physician-verified server functions using the service role).';