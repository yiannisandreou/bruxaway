# Unclench — Task Roadmap

## Random push reminders (EMA) — DONE
- [x] DB: push_subscriptions, prompt_events, profile settings (prompts_per_day/start_hour/end_hour/timezone)
- [x] DB function `eligible_prompt_users()` for the cron
- [x] VAPID public key constant (client-safe); private key stored as VAPID_PRIVATE_KEY secret
- [x] PWA manifest + app icon + favicon (for iOS install / push)
- [x] Service worker (push + notificationclick)
- [x] Client push subscribe/unsubscribe (`src/lib/push.ts`)
- [x] Server fns save/remove push subscription
- [x] Cron server route `/api/public/cron/prompt` (random-timed, daily cap, timezone-aware)
- [x] Sync prompt settings + timezone to cloud from profile
- [x] Wire notifications toggle in Profile to push subscription
- [x] Register SW + manifest in `__root.tsx`
- [x] Auto-open ReportSheet on `?checkin=1` (notification deep link)
- [x] Verified build + cron (200 with secret) + deep link + UI
- [x] pg_cron/pg_net job `unclench-prompt-tick` every 10 min hitting the live endpoint (secret stored in `cron_config`)
- [x] Minute-accurate slot spread + prune dead subscriptions (`push_delivery_failures`)
