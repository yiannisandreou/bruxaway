# Reminder delivery: what today's data shows, and what's still worth fixing

## Short answer

The under-delivery problem is fixed. What you're seeing today is a *response* gap, not a
delivery gap.

Today (local Nicosia time, day not finished yet):

| Patient | Target | Reminders sent | Check-ins logged |
| --- | --- | --- | --- |
| eleniandreou1911 | 8 | 6 | 3 |
| adreouchristina | 6 | 6 (cap reached) | 3 |
| xaralambis.andreou | 5 | 5 (cap reached) | 2 |
| yiannisandreou98 (your clinician account) | 4 | 1 | 0 |

Every send in the last 24 hours was accepted by Apple/Google (status 201) — no rejections
today. The "three logged" / "two logged" numbers you saw are the check-ins the patients
actually filled in, out of 5-6 reminders that did arrive. Two patients already hit their
full daily cap.

`yiannisstxm@gmail.com` still has no registered device, so it gets nothing — that account
needs Unclench opened once on its phone with reminders on.

## Two real issues left in the timing

1. **Bunching.** adreouchristina's 6 reminders all landed between 10:20 and 15:00, with two
   in the same minute (15:00, 15:00). Nothing came in the afternoon/evening even though her
   window runs to 23:00. The scheduler's per-tick probability can spend the whole day's quota
   early, and nothing prevents two prompts inside the same tick window.
2. **Sampling coverage.** Because the cap can be exhausted early, later hours of the day are
   systematically under-sampled — which weakens the trend data the clinic view is built on.

## Proposed fix

- Spread the daily quota across the waking window instead of drawing per tick: at the first
  tick of each local day, assign each patient's N prompt times into N evenly-sized blocks of
  their window, with a random minute inside each block. Fire when the tick reaches a
  scheduled slot. This keeps timing unpredictable to the patient while guaranteeing morning,
  afternoon and evening coverage.
- Enforce a minimum gap (e.g. 45 minutes) between consecutive prompts so same-minute or
  back-to-back duplicates can't happen.
- Mark a prompt as answered when a check-in is submitted shortly after it fired, so
  adherence in the clinic view reflects reminders answered rather than raw entry count.

## Technical notes

- New table `prompt_schedule` (user_id/device_id, local_date, slot_at, fired boolean) plus
  grants and server-role-only access; populated lazily by the cron tick on the first run of
  each local day.
- `src/routes/api/public/cron/prompt.ts`: replace the probability draw with "fire any due,
  unfired slot whose time has passed and where the last send was >45 min ago"; keep the
  existing one-target-per-person dedupe and the 400/404/410 pruning.
- `src/lib/ema.ts` / entry submit path: on a successful entry, update the most recent
  unanswered `prompt_events` row within the last ~60 minutes to `answered = true`.
- Clinic patient view: show "answered / sent" using `prompt_events`.
- No change to delivery encryption or subscription handling — those are healthy.
