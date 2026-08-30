# Fix: reminders only arrive while the app is open

## What I checked

- The scheduler is running fine: every 10 minutes, on time, no errors.
- Reminders were sent as recently as 11:40 today, and the delivery log has zero failures — so the phone's push service accepted every message.

That combination points at how the messages are labelled, not at whether they're sent. Reminders currently go out with **normal urgency** and a **1-hour expiry**. On Android, a normal-urgency web push can be held back by the phone's battery saver (Doze) and only handed to the app when it next becomes active — which is exactly the pattern you're seeing: nothing while the app is fully closed, then it appears when you open it or it's running in the background.

## The fix

1. Send reminders as **high urgency** so Android wakes the app in the background to show the notification immediately, instead of queueing it.
2. Shorten the expiry so a reminder that couldn't be delivered promptly is dropped rather than piling up and arriving as a late burst later.
3. Give each reminder its own notification tag so a new one never silently replaces a pending one.
4. Record the push service's response code for every send (not only failures), so if it still misbehaves we can see whether the problem is delivery or the phone holding messages.
5. Add a **"Send a test reminder"** button in Profile. You fully close the app, tap it beforehand or from another device — it fires one reminder immediately so we can confirm closed-app delivery in seconds instead of waiting for the next random slot.

## Also worth knowing

If reminders still only land when the app is active after this change, the remaining cause is Android's per-app battery restriction. In that case the fix is on the phone: Settings > Apps > Unclench > Battery > Unrestricted. I'll add a short note about that in the reminders section of Profile so it's discoverable.

## Technical notes

- `src/routes/api/public/cron/prompt.ts`: `options.urgency` from `"normal"` to `"high"`, `ttl` reduced, per-send unique `topic`, and log every non-2xx plus the status of successful sends into `push_delivery_failures` (renamed conceptually to a delivery log; no schema change needed beyond allowing success rows).
- `public/sw.js`: unique `tag` per notification so concurrent reminders both display.
- New server function for the manual test send, reusing the existing push builder and VAPID key; wired to a button in `src/routes/profile.tsx`.
