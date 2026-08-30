# Fix iPhone push rejection

## Confirmed diagnosis

The current push library sends notifications using the obsolete `aesgcm` payload format. Apple Web Push requires the final RFC 8291 `aes128gcm` format, so Apple rejects every request with HTTP 400 while Google's push service continues to accept it.

Repeated test attempts also leave old Apple subscription rows behind because each refreshed iPhone subscription has a new endpoint.

## Changes

1. Replace the current push request builder with an edge-compatible sender that explicitly generates RFC 8291 `aes128gcm` requests.
2. Preserve the existing VAPID key pair, notification content, high urgency, and 10-minute expiry so users do not need to grant notification permission again solely because of this server change.
3. When a test delivery is rejected, remove its old account and device records before creating the replacement subscription, preventing duplicate stale Apple endpoints.
4. Keep the existing scheduler cleanup for expired or rejected subscriptions.
5. Improve delivery diagnostics to retain Apple's short rejection reason without exposing subscription keys or endpoints.

## Verification

- Confirm the generated request uses `Content-Encoding: aes128gcm` and RFC-compliant body framing.
- Run the project checks and verify the Profile reminder controls still load correctly.
- Send a test notification to a newly registered iPhone Home Screen app and confirm Apple accepts it with a successful response instead of 400.
- Confirm Android delivery continues to succeed.

## Technical details

- Update the shared server-only sender so both scheduled and manual test reminders receive the fix.
- Update the test retry path to delete the rejected endpoint before unsubscribing and resubscribing.
- No database schema or user-facing workflow change is required.
