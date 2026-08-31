# Unclench — Task Roadmap

## Random push reminders (EMA) — DONE
- [x] DB: push_subscriptions, prompt_events, profile settings (prompts_per_day/start_hour/end_hour/timezone)
- [x] VAPID keys, PWA manifest, icons, service worker (push + notificationclick)
- [x] Client subscribe/unsubscribe + self-healing re-registration on app open
- [x] pg_cron job `unclench-prompt-tick` every 10 min hitting `/api/public/cron/prompt`
- [x] RFC 8291 `aes128gcm` delivery for Apple Web Push, with stale subscription cleanup
- [x] Auto-open ReportSheet on `?checkin=1` (notification deep link)

## Even prompt spread — DONE
- [x] `prompt_schedule` table + `prompt_targets()` (one endpoint per subject, local clock)
- [x] Cron fires pre-planned slots (one random minute per block, 45-min min gap)
- [x] Mark `prompt_events.answered` when a prompted check-in arrives
- [x] Clinician patient record shows reminders answered / sent (14 days)
