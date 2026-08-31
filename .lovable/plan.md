# Fix missing and under-delivered reminders

## What the data shows

Push delivery itself is healthy — every send in the last 24 hours was accepted (status 201), and the
scheduler has been running every 10 minutes without fail. The problem is *who* the scheduler can
reach and *how the daily cap is counted*. Four concrete issues found:

1. **Your patient account has no reminder record at all.** The account `yiannisstxm@gmail.com` is a
   patient with a waking window set, but zero stored subscriptions — so the scheduler has nothing to
   send to and it fired 0 prompts today. Its subscription existed before and is gone: yesterday two
   sends were rejected (400) and the scheduler's cleanup deleted the record. Nothing ever
   re-registers it, so the account goes permanently silent even though reminders still look "on" in
   the app.
2. **Your other account is registered but not a patient.** `yiannisandreou98@gmail.com` has a valid
   subscription, but it carries the clinician role, and the scheduler only considers patients. It
   will never receive anything.
3. **One user's daily cap is split across stale devices.** `adreouchristina@gmail.com` has three
   stored Apple endpoints from repeated resubscribes. The daily cap is counted per person but sends
   go per stored endpoint, so her 6 daily prompts get spread across three records — two of which are
   almost certainly dead phones/installs — leaving her actual phone with roughly a third of the
   expected reminders.
4. **One user's waking window is in the wrong timezone.** `eleniandreou1911@gmail.com` has timezone
   `UTC` while living in Nicosia (UTC+3), so her 08:00–22:00 window actually runs 11:00–01:00 local:
   no morning prompts, and some arriving after midnight. The timezone is only written when settings
   are edited, so accounts created before that never get corrected.

## The fix

1. **Self-healing registration on app open.** Whenever the app starts with reminders on and
   notification permission granted, re-register the browser's current subscription with the server.
   A record deleted by cleanup, or renewed by the browser, repairs itself the next time the app is
   opened instead of going silent forever.
2. **Handle browser-initiated subscription renewal.** Listen for the service worker's
   `pushsubscriptionchange` event and store the new subscription immediately, so renewals don't
   orphan the server record.
3. **One live endpoint per person.** When storing a subscription, retire that account's other
   endpoints instead of accumulating them, and prune endpoints that have not been successfully
   delivered to. That restores the full daily count to the phone actually in use.
4. **Keep the timezone and window fresh.** Push the device's real timezone (and the current window
   settings) to the account on every app open, not only when the user edits settings. One-off data
   cleanup sets the existing mismatched timezone to the correct one.
5. **Make the role explicit for reminders.** Ensure the signed-in account that should receive
   reminders holds the patient role; show a clear note in the profile when the signed-in account is
   a clinician account and therefore won't get reminders.
6. **Honest status in the profile screen.** Replace the ambiguous toggle state with what the server
   actually knows: "reminders registered for this device" vs "not registered — tap to fix", plus the
   count received today.

## Technical notes

- `src/lib/push.ts`: add `ensureSubscriptionRegistered()` (permission + settings check, reuses
  `usableSubscription`, calls `storeSubscription`); call it from `__root.tsx` after
  `registerServiceWorker()`.
- `public/sw.js`: add a `pushsubscriptionchange` handler that resubscribes with the VAPID key and
  POSTs the new keys to a small public endpoint (`src/routes/api/public/push/renew.ts`) which
  upserts by old endpoint.
- `src/lib/push.functions.ts` / `savePushSubscription`: delete the caller's other
  `push_subscriptions` rows (keep the incoming endpoint) rather than only conflicting ones.
- `src/lib/ema.ts` `syncSettingsToCloud()`: also invoked on app open (root effect), so
  `profiles.timezone` self-corrects.
- Data cleanup migration/SQL: delete the two older Apple endpoint rows for the affected user; set
  `profiles.timezone = 'Asia/Nicosia'` where it is `UTC` for accounts whose entries are Nicosia-local.
- Cron scheduler (`src/routes/api/public/cron/prompt.ts`): keep the per-person cap, but pick a
  single most-recently-updated subscription per user per tick so multiple stored rows can't split
  the day's quota.
- Profile screen: read registration state from the server via a small authenticated server fn and
  render the honest status line.
