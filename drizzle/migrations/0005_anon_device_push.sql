-- Anonymous (not signed in) device push subscriptions.
-- Only reachable through trusted server code (service_role); no anon/authenticated grants.
CREATE TABLE IF NOT EXISTS public.device_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  prompts_per_day int NOT NULL DEFAULT 8,
  start_hour int NOT NULL DEFAULT 8,
  end_hour int NOT NULL DEFAULT 22,
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, endpoint)
);

GRANT ALL ON public.device_push_subscriptions TO service_role;
ALTER TABLE public.device_push_subscriptions ENABLE ROW LEVEL SECURITY;
-- No policies: direct client access is denied by design.

-- prompt_events must be able to record device-scoped prompts too.
ALTER TABLE public.prompt_events ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.prompt_events ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE public.prompt_events
  ADD CONSTRAINT prompt_events_owner_present
  CHECK (user_id IS NOT NULL OR device_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS prompt_events_device_day_idx
  ON public.prompt_events (device_id, fired_at DESC);

CREATE OR REPLACE FUNCTION public.eligible_prompt_devices()
RETURNS TABLE (
  device_id text,
  endpoint text,
  p256dh text,
  auth_key text,
  prompts_per_day int,
  start_hour int,
  end_hour int,
  local_hour int,
  fired_today int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    d.device_id,
    d.endpoint,
    d.p256dh,
    d.auth_key,
    d.prompts_per_day,
    d.start_hour,
    d.end_hour,
    EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(d.timezone,'UTC')))::int AS local_hour,
    (
      SELECT count(*)::int FROM public.prompt_events pe
      WHERE pe.device_id = d.device_id
        AND date_trunc('day', pe.fired_at AT TIME ZONE COALESCE(d.timezone,'UTC'))
          = date_trunc('day', now() AT TIME ZONE COALESCE(d.timezone,'UTC'))
    ) AS fired_today
  FROM public.device_push_subscriptions d
  WHERE
    EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(d.timezone,'UTC')))::int >= d.start_hour
    AND EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(d.timezone,'UTC')))::int < d.end_hour
    AND (
      SELECT count(*) FROM public.prompt_events pe
      WHERE pe.device_id = d.device_id
        AND date_trunc('day', pe.fired_at AT TIME ZONE COALESCE(d.timezone,'UTC'))
          = date_trunc('day', now() AT TIME ZONE COALESCE(d.timezone,'UTC'))
    ) < d.prompts_per_day
$$;

REVOKE ALL ON FUNCTION public.eligible_prompt_devices() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.eligible_prompt_devices() TO service_role;