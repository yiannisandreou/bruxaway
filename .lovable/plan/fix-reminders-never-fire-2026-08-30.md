# Fix: reminders never fire

## What I found

Reminders are fully built but nothing is scheduled to run them:

- 4 devices are subscribed to push, and their waking-hour/prompt settings are stored correctly.
- The reminder endpoint (`/api/public/cron/prompt`) exists and its secret and push signing key are both configured.
- `prompt_events` is completely empty — the endpoint has never once been called.
- The database scheduler extensions (`pg_cron`, `pg_net`) are not installed, and no schedule exists.

So the app is waiting to be triggered every few minutes, and nobody is triggering it. That's why no notification arrived today.

## The fix

1. Enable the scheduler in the backend (`pg_cron` + `pg_net`).
2. Register a job that runs every 10 minutes and calls the published reminder endpoint with the existing bearer secret, so it works on the live app rather than a temporary preview URL.
3. Store the secret in the database's vault-style settings rather than inline, so it isn't readable from the job listing.
4. Trigger the job once manually and confirm a `prompt_events` row appears and a notification lands on your phone.

## Also worth tightening (same change)

- Right now the firing probability uses `end_hour - local_hour`, which drops to a single slot near the end of the day and can bunch prompts at the boundary. I'll make the remaining-slots calculation minute-accurate so prompts spread evenly across your waking window.
- Add a small delivery-failure log so dead subscriptions (phone reinstalled, permission revoked) get pruned instead of silently retried forever.

## Technical notes

- New migration: `create extension pg_cron`/`pg_net`, `cron.schedule('unclench-prompt-tick', '*/10 * * * *', ...)` issuing `net.http_post` to `https://bruxaway.lovable.app/api/public/cron/prompt` with `Authorization: Bearer <LOVABLE_CRON_SECRET>`.
- Verification: query `cron.job` and `cron.job_run_details`, then `prompt_events` for a fresh row.
- No UI changes; the reminder toggle in Profile stays as is.
