# Fix "This device isn't subscribed" on the test reminder (Android)

## What's happening

Your Android phone still receives the scheduled reminders (the delivery log shows successful
sends every 10 minutes), so push itself is healthy. The "Send a test reminder" button is the
part that's broken: it only asks the server to push to an endpoint the server has *already*
stored, and it looks that record up in a way that fails whenever the browser's current
subscription doesn't exactly match the stored row. The log confirms no test send was ever
attempted from the Android device — it never got past that lookup.

Two concrete problems found in the data and code:

- The same Android push endpoint is stored under two different accounts, and the test-send
  lookup expects at most one matching row, so it can error out instead of sending.
- The test send has no way to register the browser's current subscription; if the phone's
  subscription was renewed by the browser (which happens routinely) the server has no row
  for it and answers "this device isn't subscribed", even though reminders still work from
  the older row.

## The fix

Make the test reminder self-sufficient instead of dependent on prior state:

1. The app sends the full current subscription (endpoint + keys) with the test request.
2. The server stores/refreshes that subscription first (account row when signed in, device
   row when not), then pushes to it. So pressing the button always delivers to the phone in
   front of you, and simultaneously repairs a stale record.
3. Endpoint lookups tolerate duplicates (take the first match rather than erroring).
4. Clean up the duplicate/orphaned endpoint rows so a single endpoint isn't owned by two
   accounts, and keep future writes from recreating them.
5. Clearer failure text: distinguish "reminders are off / permission missing" from "the push
   service rejected it", so the message on screen matches reality.

No changes to how the scheduled reminders work, and no UI redesign — just the reminders card's
button behaviour and its status message.

## Technical notes

- `src/lib/push-test.functions.ts`: accept `{ endpoint, p256dh, auth_key, device_id?, settings? }`,
  upsert into `push_subscriptions` (authenticated caller) or `device_push_subscriptions`
  (anonymous), then `sendPush`. Replace `.maybeSingle()` endpoint lookups with
  `.limit(1)` + first row.
- `src/lib/push.ts`: `sendTestReminder` passes the live `PushSubscription` keys; keep the
  single resubscribe-and-retry fallback for genuinely dead subscriptions.
- `src/routes/api/public/cron/prompt.ts`: same duplicate-tolerant lookup/prune behaviour.
- Migration: delete `push_subscriptions` rows whose endpoint is also owned by another,
  newer row (dedupe by endpoint keeping the most recent `updated_at`).
