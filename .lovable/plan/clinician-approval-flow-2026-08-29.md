# Clinician approval flow

## Current state (verified)

- Picking "Clinician" at signup sets a local `intent` flag only. `ensureAccount` / `AccountSync.tsx` always writes the **patient** role, and RLS blocks self-granting `physician` (the security fix you approved). So a "clinician" signup becomes a patient.
- The "Your clinic will enable it after verification" message is a **stub**: there is no screen, server function, or table that lets anyone grant the physician role from inside the app. Today the only way to make an account a physician is to run SQL directly against `user_roles` with privileged (service-role) access.

## Goal

Make clinician access a real, self-contained approval workflow that happens entirely inside the app, with no manual SQL needed after the very first physician is bootstrapped.

## Design

### Bootstrap (one-time, documented)
- The first physician is created once, manually, by running a single SQL statement in the backend SQL editor against `user_roles`. This is documented in-app/onboarding text and never needed again.
- That first physician can then approve all subsequent clinicians from inside the app.

### Data model (new migration)
- New table `public.role_requests`:
  - `id uuid pk default gen_random_uuid()`
  - `user_id uuid not null` (the person requesting)
  - `email text`, `full_name text` (snapshot for the reviewer)
  - `status app_role_request_status` enum: `pending`, `approved`, `rejected` (default `pending`)
  - `reviewer_id uuid` (the physician who decided), nullable
  - `created_at timestamptz default now()`, `reviewed_at timestamptz`
- Grants: `authenticated` can INSERT a row for themselves and SELECT their own; `physician` (via `has_role`) can SELECT all pending/recent rows. `service_role` full access.
- RLS policies:
  - INSERT: `auth.uid() = user_id` (a user can only create their own request).
  - SELECT own: `auth.uid() = user_id`.
  - SELECT all (for reviewers): `has_role(auth.uid(),'physician')`.
  - No UPDATE/DELETE for authenticated — updates happen only via the server function below.

### Request at signup
- When the user picks "Clinician" and signs up, the client inserts a `role_requests` row with status `pending` (idempotent on `user_id` so re-signups don't duplicate).
- The on-screen copy changes to an accurate message: "Your request is sent. Once your clinic approves it, the Clinic tab appears automatically." No claim that it's already enabled.

### Approval server function (new `approveClinician`)
- `createServerFn` POST, `.middleware([requireSupabaseAuth])`.
- Input: `requestId`.
- Verify caller `has_role(... 'physician')` via `context.supabase.rpc`; reject otherwise.
- Load the request; confirm it's `pending`.
- Use `supabaseAdmin` to `INSERT INTO user_roles (user_id, role) VALUES (<request.user_id>, 'physician')` (ON CONFLICT do nothing), then UPDATE the request to `approved` with `reviewer_id = context.userId`.
- A physician can also **reject**, setting status `rejected`.

### Clinic dashboard UI
- `clinic.index.tsx` gains an "Approval requests" section listing pending requests (name, email, requested time) with **Approve** / **Reject** buttons that call the server function.
- Approved clinicians then see the Clinic tab on their next sign-in (role is re-read via `useSession` / `onAuthStateChange` invalidation).

### Re-activation after approval
- The approved user already has a session; their `useSession` reads role on `USER_UPDATED` / manual refresh. To make it feel instant, the Clinic tab appears on next page load / app reopen. (No push needed; a simple refresh is acceptable for v1.)

## Out of scope
- Email notification of approval (could be added later via the email connector).
- Multiple clinics / org boundaries (single shared clinician pool for now).

## Files to change
- New migration: `role_requests` table + enum + grants + RLS.
- `src/lib/clinician.functions.ts` (new): `approveClinician` / `rejectClinician` server fns.
- `src/routes/auth.tsx`: write a pending request on clinician signup; update the helper copy.
- `src/routes/_authenticated/clinic.index.tsx`: add the approval queue UI.
- `src/lib/session.ts` / `AccountSync.tsx`: keep patient-only self-grant; no change to role logic.

## Security notes
- Self-grant of `physician` stays blocked by RLS (no regression to the earlier fix).
- Promotion happens only inside a server function, only after a verified physician approves, using the service-role client server-side.
- `role_requests` reveals no account-existence info beyond the requester's own email/name (which they themselves supplied).
