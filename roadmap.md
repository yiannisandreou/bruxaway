# Unclench — Task Roadmap

## Active: Random push reminders (EMA)
- [x] DB: push_subscriptions, prompt_events, profile settings (prompts_per_day/start_hour/end_hour/timezone)
- [ ] DB function `eligible_prompt_users()` for the cron
- [ ] VAPID public key constant (client-safe)
- [ ] PWA manifest + app icon (for iOS install / push)
- [ ] Service worker (push + notificationclick)
- [ ] Client push subscribe/unsubscribe (`src/lib/push.ts`)
- [ ] Server fns save/remove push subscription
- [ ] Cron server route `/api/public/cron/prompt` (random-timed, daily cap)
- [ ] Sync prompt settings + timezone to cloud from profile
- [ ] Wire notifications toggle in Profile to push subscription
- [ ] Register SW + manifest in `__root.tsx`
- [ ] Auto-open ReportSheet on `?checkin=1` (notification deep link)
- [ ] Verify build + flow
