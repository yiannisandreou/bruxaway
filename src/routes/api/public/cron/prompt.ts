import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/prompt")({
  server: {
    handlers: {
      GET: promptHandler,
      POST: promptHandler,
    },
  },
});

type EligibleRow = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  prompts_per_day: number;
  start_hour: number;
  end_hour: number;
  local_hour: number;
  fired_today: number;
};

/**
 * Called every few minutes by an external scheduler (cron-job.org, pg_cron, etc.)
 * authenticated with the LOVABLE_CRON_SECRET bearer token.
 *
 * For each patient with a push subscription, while inside their local waking
 * window and under their daily prompt cap, fires a prompt with a probability
 * that self-corrects toward the target count by end of day. Random timing
 * (rather than fixed schedule) matches EMA methodology and reduces habituation.
 */
async function promptHandler({ request }: { request: Request }) {
  const authed = await authenticateCronRequest(request);
  if (authed) return authed;

  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  if (!privateKey) return new Response("VAPID_PRIVATE_KEY not configured", { status: 500 });

  const origin = new URL(request.url).origin;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("eligible_prompt_users");
  if (error) return new Response("query error", { status: 500 });

  const rows = (data ?? []) as EligibleRow[];
  let fired = 0;

  for (const row of rows) {
    const remaining = Math.max(0, row.prompts_per_day - row.fired_today);
    // ~6 ten-minute slots per hour still ahead in today's waking window.
    const slotsLeft = Math.max(1, (row.end_hour - row.local_hour) * 6);
    const probability = remaining / slotsLeft;
    if (Math.random() >= probability) continue;

    // Record the fired prompt (counts toward today's cap for subsequent ticks).
    const { error: insErr } = await supabaseAdmin
      .from("prompt_events")
      .insert({ user_id: row.user_id, fired_at: new Date().toISOString() });
    if (insErr) continue;

    try {
      await sendPush(row, privateKey, origin);
    } catch {
      // delivery failure shouldn't abort the loop; the prompt is already recorded
    }
    fired++;
  }

  return Response.json({ fired, eligible: rows.length });
}

async function sendPush(row: EligibleRow, privateKey: string, origin: string) {
  const { buildPushHTTPRequest } = await import("@pushforge/builder");
  const req = await buildPushHTTPRequest({
    privateJWK: privateKey,
    subscription: {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth_key },
    },
    message: {
      payload: {
        title: "Jaw check-in",
        body: "What's your jaw doing right now?",
        url: `${origin}/?checkin=1`,
        icon: `${origin}/icon-512.png`,
      },
      adminContact: "mailto:hello@unclench.app",
      options: { ttl: 3600, urgency: "normal", topic: "unclench-prompt" },
    },
  });
  await fetch(req.endpoint, {
    method: "POST",
    headers: req.headers as Record<string, string>,
    body: req.body,
  });
}
