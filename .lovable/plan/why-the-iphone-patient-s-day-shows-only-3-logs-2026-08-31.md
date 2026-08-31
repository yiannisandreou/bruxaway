# Why the iPhone patient's day shows only 3 logs

## What the data actually shows for adreouchristina@gmail.com (local Nicosia time)

| Fact | Value |
| --- | --- |
| Reminders her schedule planned for today | 6 |
| Reminders actually sent (push accepted) | 4 (10:20, 11:00, 14:20, plus a duplicate pair at 15:00) |
| Scheduled slots marked "fired" with no send and no record | 15:45 and 18:06 — nothing left the server |
| Check-ins stored in the cloud | 3 (11:52, 11:52, 16:03) |
| Reminders marked as answered | 0 — for every patient, not just her |

So she is partly right: two of her afternoon/evening reminders were consumed by the
scheduler without ever being delivered, so there was nothing to answer. Two of her
three logged check-ins also arrived in the same minute (11:52:34 and 11:52:47), which
looks like one form submitted twice.

Separately, the "answered" flag is never set on any reminder, so today there is no
reliable way to distinguish "she missed it" from "it was never sent" — that is the real
reporting gap behind this question.

Two smaller issues confirmed in today's data: another patient received sends 10 minutes
apart (20:40 and 20:50) and 40 minutes apart, so the intended 45-minute spacing is not
actually being enforced; and one patient had two subscriptions at once, which is why two
prompts went out in the same minute at 15:00.

## Fixes

1. Stop burning reminder slots. Mark a scheduled slot as used only after the push has
   been accepted. If the record write or the send fails, leave the slot due so the next
   tick retries it instead of silently losing the reminder for the day.
2. Log every skipped or failed slot with a reason, so a missing reminder is visible in
   the delivery diagnostics rather than invisible.
3. Enforce the spacing properly: compute the gap from the last *successful* send for
   that person and skip firing when it is under the minimum, and never fire more than
   one slot per tick.
4. Make "answered" work: when a check-in is saved, mark the most recent unanswered
   reminder as answered on the server side (not only from the browser, which can fail
   silently if the session has expired), and back-fill today's rows by matching existing
   check-ins to the reminder that preceded them.
5. Guard against duplicate submissions of the same check-in form so a single answer
   cannot land twice.
6. Clinic patient view: show reminders sent / answered / not answered for the last 14
   days and for today, so the clinician can see immediately whether a low log count is
   under-delivery or non-response.

## Verification

- Re-run the scheduler and confirm every fired slot has both a delivery record and a
  reminder record, and that no slot is marked used without a send.
- Confirm consecutive sends per patient are at least the minimum gap apart.
- Submit a check-in and confirm the preceding reminder flips to answered.
- Confirm the clinic view for adreouchristina shows sent vs answered for today.

## Technical notes

- `src/routes/api/public/cron/prompt.ts`: reorder to insert `prompt_events` and send
  first, mark `prompt_schedule.fired` only on success, fire at most one due slot per
  target per tick, and record skip reasons in `push_delivery_failures`.
- New server function to mark a reminder answered, called from the entry submit path in
  `src/lib/sync.ts`, replacing the client-side update; one-off back-fill of today's rows.
- `src/components/ReportSheet.tsx`: disable submit while saving to prevent double entries.
- `src/routes/_authenticated/clinic.$patientId.tsx`: extend the adherence block with
  today's sent/answered/missed counts.
- No schema change beyond what already exists.
