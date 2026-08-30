/** Server-only web push delivery helper (shared by the cron tick and test sends). */

export type PushTarget = {
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

export async function sendPush(
  target: PushTarget,
  privateKey: string,
  origin: string,
  body = "What's your jaw doing right now?",
): Promise<number> {
  const { buildPushHTTPRequest } = await import("@pushforge/builder");
  const req = await buildPushHTTPRequest({
    privateJWK: privateKey,
    subscription: {
      endpoint: target.endpoint,
      keys: { p256dh: target.p256dh, auth: target.auth_key },
    },
    message: {
      payload: {
        title: "Jaw check-in",
        body,
        url: `${origin}/?checkin=1`,
        icon: `${origin}/icon-512.png`,
      },
      adminContact: "mailto:hello@unclench.app",
      options: {
        // High urgency asks the push service to wake the device immediately
        // instead of batching the message until the app is next active.
        ttl: 600,
        urgency: "high",
        // Unique topic per send so a queued reminder is never collapsed into
        // (and silently replaced by) the next one.
        topic: `unclench-${Math.random().toString(36).slice(2, 10)}`,
      },
    },
  });
  const res = await fetch(req.endpoint, {
    method: "POST",
    headers: req.headers as Record<string, string>,
    body: req.body,
  });
  return res.status;
}
