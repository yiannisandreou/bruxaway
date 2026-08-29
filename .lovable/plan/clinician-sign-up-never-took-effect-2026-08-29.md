# Clinician sign-up never took effect

## What I found

Both accounts in the system currently hold the **patient** role, and there are no pending clinician requests at all. So the clinician path never ran for your sign-up — which is why the interface looks identical (the Clinic tab only appears for a verified physician role).

Why it was lost: the clinician request is only fired right after a sign-up that returns a live session. When email confirmation was still switched on, sign-up returned "check your inbox" and stopped there, so the request was never sent. When you later signed in, the Patient/Clinician picker is hidden on the sign-in form, so the app defaulted to patient. Since no physician exists yet, that request would have auto-promoted you to the first clinician.

## Plan

### 1. Make you a clinician now
Promote your account to the physician role directly, so the Clinic tab and caseload view appear on your next load.

### 2. Stop the intent from getting lost
- Persist the chosen "I am a clinician" intent locally at sign-up and keep it until it is actually resolved (today it is cleared too early).
- Run the clinician request/bootstrap step on **every** successful session start — after sign-up, after email confirmation, and after sign-in — not only on the single sign-up-with-session path. It stays idempotent: it either promotes the very first clinician or records one pending request.
- Clear the stored intent only once the request succeeds or the account is already a physician.

### 3. Make the state visible
- After a clinician request is recorded, show a persistent "Clinician access pending approval" note in the Profile screen rather than a one-off message on the auth screen that disappears on navigation.
- When the account already is a physician, the Clinic tab appears and the pending note disappears.

## Technical notes

- Move the clinician-intent handling out of `afterAuth` in `src/routes/auth.tsx` into the already-mounted `src/components/AccountSync.tsx`, which runs on every session appearance; it currently deletes the pending-role key unconditionally.
- `requestOrBootstrapClinician` in `src/lib/clinician.functions.ts` is unchanged — it already handles bootstrap-vs-pending and is idempotent per user.
- After a bootstrap promotion, refresh the session and invalidate queries so `useSession` picks up the physician role and `AppShell` renders the Clinic tab.
- Profile pending note reads the caller's own `role_requests` row (owner-scoped read).
- One-time data change: set your account's role to physician.
