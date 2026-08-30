-- A push endpoint identifies one browser install; it must not be owned by two
-- accounts (that made endpoint lookups ambiguous). Keep the most recent row.
DELETE FROM public.push_subscriptions ps
USING public.push_subscriptions newer
WHERE ps.endpoint = newer.endpoint
  AND (newer.updated_at, newer.id) > (ps.updated_at, ps.id);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON public.push_subscriptions (endpoint);

DELETE FROM public.device_push_subscriptions d
USING public.device_push_subscriptions newer
WHERE d.endpoint = newer.endpoint
  AND (newer.updated_at, newer.id) > (d.updated_at, d.id);

CREATE UNIQUE INDEX IF NOT EXISTS device_push_subscriptions_endpoint_key
  ON public.device_push_subscriptions (endpoint);
