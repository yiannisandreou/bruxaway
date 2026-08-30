-- Scheduler extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Server-only key/value store for the cron bearer secret. No grants at all:
-- only privileged server code (service role) can read or write it.
create table if not exists public.cron_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.cron_config enable row level security;
revoke all on public.cron_config from anon, authenticated;
grant all on public.cron_config to service_role;

-- Track push delivery failures so dead subscriptions can be pruned.
create table if not exists public.push_delivery_failures (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  status integer,
  detail text,
  occurred_at timestamptz not null default now()
);
alter table public.push_delivery_failures enable row level security;
revoke all on public.push_delivery_failures from anon, authenticated;
grant all on public.push_delivery_failures to service_role;

-- Every 10 minutes: ping the reminder endpoint on the published app.
select cron.unschedule(jobname) from cron.job where jobname = 'unclench-prompt-tick';
select cron.schedule('unclench-prompt-tick', '*/10 * * * *', $job$
  select net.http_post(
    url := 'https://bruxaway.lovable.app/api/public/cron/prompt',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.cron_config where key = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
$job$);