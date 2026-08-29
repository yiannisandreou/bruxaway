# Fix email verification on sign-up

## What's happening

The auth logs show your sign-up email link reaching the backend twice: one hit verifies and redirects (303), a second identical hit fails with "One-time token not found" — the token is single-use. The account is left unconfirmed, so signing in returns "Email not confirmed". The logs also show several rapid repeat sign-up attempts hitting the email rate limit, which invalidates earlier links.

## Plan

### 1. Unblock you today
Turn on instant confirmation for new sign-ups so accounts can sign in immediately, and confirm your existing account so your current email/password works right away.

### 2. Fix the confirmation link properly
- Add a public `/auth/callback` page that handles both link formats: the modern `token_hash` + `type` query params (verified once via `verifyOtp`) and the older `access_token` hash fragment. It shows "Confirming your email…", then success or a clear failure state with a "Resend confirmation email" button.
- Point sign-up's `emailRedirectTo` at `/auth/callback` instead of the bare origin, so the app — not a bare redirect — completes verification.
- Make the callback idempotent: if verification fails but a valid session already exists (link consumed by a prefetch on the first hit), treat it as success instead of showing an error.

### 3. Better sign-in feedback
- On the sign-in form, when the backend returns "email not confirmed", show a friendly message plus a "Resend confirmation email" button rather than the raw error.
- Guard against rapid repeat sends: disable the button for 60 seconds after a send and surface the rate-limit message plainly.

## Technical notes

- New route `src/routes/auth.callback.tsx` (public, no auth gate), using `supabase.auth.verifyOtp({ token_hash, type })`.
- `src/routes/auth.tsx`: `emailRedirectTo: \`${window.location.origin}/auth/callback\``; new `resendConfirmation` handler calling `supabase.auth.resend({ type: 'signup', email })`; `email_not_confirmed` branch in the error handling.
- Auth config change: enable auto-confirm for email sign-ups (reversible later if you want strict verification).
- Head metadata added for the new route.

Note: with auto-confirm on, verification emails stop gating access — the fixed callback flow stays in place so you can switch verification back on at any time.
