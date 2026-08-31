# Fix: Clinic tab missing for your clinician account

## What's actually wrong (verified in the database)

Your account (`yiannisandreou98@gmail.com`) has **two** role rows: `physician` **and** `patient`. The second one was added earlier so reminders would reach you (the reminder scheduler skipped clinician-only accounts).

The app reads your role with a query that takes **one arbitrary row** and stops. When it happens to pick `patient`, the app treats you as a patient: the Clinic tab disappears and `/clinic` shows "Clinician access pending".

So the data is fine — the role lookup is what's broken.

## The fix

1. **Read all roles, not one.** Change the role lookup to fetch every role row for the signed-in user and pick the highest-privilege one (`physician` beats `patient`). Accounts with both roles then behave as clinicians while keeping patient-side features (own check-ins, reminders) working.
2. **Expose the full role set** so the UI can keep showing your personal check-in tabs alongside the Clinic tab — no either/or.
3. **Re-check `/clinic`'s guard** so it uses the same resolved role, ending the false "access pending" screen.

No database change is needed and no security rule changes: self-granting `physician` stays blocked, and clinic data access is still enforced by row-level security on the server.

## Technical detail

- `src/lib/session.ts`: `loadRole` currently does `.limit(1).maybeSingle()` on `user_roles`. Replace with a full `select("role")`, return `roles: AppRole[]` plus a derived `role` that prefers `physician`.
- `src/components/AppShell.tsx` and `src/routes/_authenticated/clinic.index.tsx` already read `role` from `useSession()`, so they pick the fix up automatically; verify the clinic guard once the change is in.
- `src/components/AccountSync.tsx` keeps writing only the `patient` role for self-service signup — unchanged.

## Verification

Sign in on your phone, confirm the Clinic tab appears next to Now/Trends/Cues/Profile, and that the caseload list loads your assigned patients.
