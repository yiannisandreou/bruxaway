CREATE OR REPLACE FUNCTION public.eligible_prompt_users()
RETURNS TABLE (
  user_id uuid,
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
    ps.user_id,
    ps.endpoint,
    ps.p256dh,
    ps.auth_key,
    p.prompts_per_day,
    p.start_hour,
    p.end_hour,
    EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(p.timezone,'UTC')))::int AS local_hour,
    (
      SELECT count(*)::int FROM public.prompt_events pe
      WHERE pe.user_id = ps.user_id
        AND date_trunc('day', pe.fired_at AT TIME ZONE COALESCE(p.timezone,'UTC'))
          = date_trunc('day', now() AT TIME ZONE COALESCE(p.timezone,'UTC'))
    ) AS fired_today
  FROM public.push_subscriptions ps
  JOIN public.profiles p ON p.id = ps.user_id
  JOIN public.user_roles ur ON ur.user_id = ps.user_id AND ur.role = 'patient'
  WHERE
    EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(p.timezone,'UTC')))::int >= p.start_hour
    AND EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(p.timezone,'UTC')))::int < p.end_hour
    AND (
      SELECT count(*) FROM public.prompt_events pe
      WHERE pe.user_id = ps.user_id
        AND date_trunc('day', pe.fired_at AT TIME ZONE COALESCE(p.timezone,'UTC'))
          = date_trunc('day', now() AT TIME ZONE COALESCE(p.timezone,'UTC'))
    ) < p.prompts_per_day
$$;