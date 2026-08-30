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
  const devices = await supabaseAdmin.rpc("eligible_prompt_devices");
  const deviceRows = (devices.data ?? []) as (Omit<EligibleRow, "user_id"> & {
    device_id: string;
  })[];
  let fired = 0;

  const targets: (EligibleRow & { device_id?: string })[] = [
    ...rows,
    ...deviceRows.map((d) => ({ ...d, user_id: "" })),
  ];

  // Minutes already elapsed in the current hour — used to make the remaining
  // slot count minute-accurate so prompts spread evenly instead of bunching
  // near the end of the waking window.
  const minuteOfHour = new Date().getUTCMinutes();

  for (const row of targets) {
    const remaining = Math.max(0, row.prompts_per_day - row.fired_today);
    if (remaining === 0) continue;
    // Ten-minute ticks still ahead in today's waking window.
    const minutesLeft = Math.max(
      10,
      (row.end_hour - row.local_hour) * 60 - minuteOfHour,
    );
    const slotsLeft = Math.max(1, Math.round(minutesLeft / 10));
    const probability = remaining / slotsLeft;
    if (Math.random() >= probability) continue;

    // Record the fired prompt (counts toward today's cap for subsequent ticks).
    const { error: insErr } = await supabaseAdmin.from("prompt_events").insert({
      user_id: row.device_id ? null : row.user_id,
      device_id: row.device_id ?? null,
      fired_at: new Date().toISOString(),
    });
    if (insErr) continue;

    try {
      const status = await sendPush(row, privateKey, origin);
      if (status === 404 || status === 410) {
        // Subscription is dead (app reinstalled / permission revoked) — prune it.
        await supabaseAdmin
          .from("push_delivery_failures")
          .insert({ endpoint: row.endpoint, status, detail: "pruned expired subscription" });
        if (row.device_id) {
          await supabaseAdmin
            .from("device_push_subscriptions")
            .delete()
            .eq("endpoint", row.endpoint);
        } else {
          await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", row.endpoint);
        }
        continue;
      }
      if (status >= 400) {
        await supabaseAdmin
          .from("push_delivery_failures")
          .insert({ endpoint: row.endpoint, status, detail: "delivery rejected" });
      }
    } catch (err) {
      // delivery failure shouldn't abort the loop; the prompt is already recorded
      await supabaseAdmin
        .from("push_delivery_failures")
        .insert({ endpoint: row.endpoint, detail: String(err).slice(0, 300) })
        .then(() => undefined, () => undefined);
    }
    fired++;
  }

  return Response.json({ fired, eligible: targets.length });
}


async function sendPush(
  row: EligibleRow,
  privateKey: string,
  origin: string,
): Promise<number> {
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
  const res = await fetch(req.endpoint, {
    method: "POST",
    headers: req.headers as Record<string, string>,
    body: req.body,
  });
  return res.status;
}

