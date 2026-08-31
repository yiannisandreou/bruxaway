CREATE TABLE public.prompt_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  device_id text,
  local_date date NOT NULL,
  slot_local timestamp NOT NULL,
  fired boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.prompt_schedule TO service_role;

ALTER TABLE public.prompt_schedule ENABLE ROW LEVEL SECURITY;

-- Server-only table: no policies for anon/authenticated, service_role bypasses RLS.
REVOKE ALL ON public.prompt_schedule FROM anon, authenticated;

CREATE UNIQUE INDEX prompt_schedule_user_slot_idx
  ON public.prompt_schedule (user_id, local_date, slot_local)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX prompt_schedule_device_slot_idx
  ON public.prompt_schedule (device_id, local_date, slot_local)
  WHERE device_id IS NOT NULL;

CREATE INDEX prompt_schedule_due_idx ON public.prompt_schedule (local_date, fired);

-- One target per subject (most recently updated endpoint), with the local clock,
-- local date and last send time the scheduler needs to place and pace slots.
CREATE OR REPLACE FUNCTION public.prompt_targets()
RETURNS TABLE(
  user_id uuid,
  device_id text,
  endpoint text,
  p256dh text,
  auth_key text,
  prompts_per_day integer,
  start_hour integer,
  end_hour integer,
  timezone text,
  local_now timestamp,
  local_date date,
  last_fired_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH users AS (
    SELECT DISTINCT ON (ps.user_id)
      ps.user_id,
      NULL::text AS device_id,
      ps.endpoint,
      ps.p256dh,
      ps.auth_key,
      p.prompts_per_day,
      p.start_hour,
      p.end_hour,
      COALESCE(p.timezone, 'UTC') AS timezone
    FROM public.push_subscriptions ps
    JOIN public.profiles p ON p.id = ps.user_id
    JOIN public.user_roles ur ON ur.user_id = ps.user_id AND ur.role = 'patient'
    ORDER BY ps.user_id, ps.updated_at DESC
  ),
  devices AS (
    SELECT DISTINCT ON (d.device_id)
      NULL::uuid AS user_id,
      d.device_id,
      d.endpoint,
      d.p256dh,
      d.auth_key,
      d.prompts_per_day,
      d.start_hour,
      d.end_hour,
      COALESCE(d.timezone, 'UTC') AS timezone
    FROM public.device_push_subscriptions d
    WHERE NOT EXISTS (
      SELECT 1 FROM public.push_subscriptions ps WHERE ps.endpoint = d.endpoint
    )
    ORDER BY d.device_id, d.updated_at DESC
  ),
  all_targets AS (
    SELECT * FROM users UNION ALL SELECT * FROM devices
  )
  SELECT
    t.user_id,
    t.device_id,
    t.endpoint,
    t.p256dh,
    t.auth_key,
    t.prompts_per_day,
    t.start_hour,
    t.end_hour,
    t.timezone,
    (now() AT TIME ZONE t.timezone) AS local_now,
    (now() AT TIME ZONE t.timezone)::date AS local_date,
    (
      SELECT max(pe.fired_at) FROM public.prompt_events pe
      WHERE (t.user_id IS NOT NULL AND pe.user_id = t.user_id)
         OR (t.device_id IS NOT NULL AND pe.device_id = t.device_id)
    ) AS last_fired_at
  FROM all_targets t
$$;

REVOKE ALL ON FUNCTION public.prompt_targets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prompt_targets() TO service_role;