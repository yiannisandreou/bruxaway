import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Sends one reminder immediately to the caller's current push subscription.
 *
 * The full subscription is sent along, so the send never depends on a row
 * already existing server-side: if the browser renewed its subscription (or the
 * stored row is stale), the record is repaired first and then the push goes out.
 * Deliberately unauthenticated — reminders work without an account — and it can
 * only push to the subscription the caller itself owns the keys for.
 */
export const sendTestPush = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        endpoint: z.string().url().startsWith("https://"),
        p256dh: z.string().min(1).max(200),
        auth_key: z.string().min(1).max(200),
        device_id: z.string().uuid(),
        prompts_per_day: z.number().int().min(1).max(24).default(8),
        start_hour: z.number().int().min(0).max(23).default(8),
        end_hour: z.number().int().min(1).max(24).default(22),
        timezone: z.string().min(1).max(64).default("UTC"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const privateKey = process.env["VAPID_PRIVATE_KEY"];
    const origin = process.env["PUBLIC_ORIGIN"] ?? "https://bruxaway.lovable.app";
    if (!privateKey) return { ok: false as const, reason: "Push is not configured." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Is this endpoint already attached to an account? Then leave that row alone
    // (the scheduler uses it) — duplicates are tolerated by taking the first row.
    const { data: accountRows } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint")
      .eq("endpoint", data.endpoint)
      .limit(1);

    if (!accountRows?.length) {
      // Register/refresh the device-level subscription so the test can be
      // delivered and future scheduled prompts reach this endpoint too.
      await supabaseAdmin
        .from("device_push_subscriptions")
        .delete()
        .eq("device_id", data.device_id)
        .neq("endpoint", data.endpoint);
      const { error } = await supabaseAdmin.from("device_push_subscriptions").upsert(
        {
          device_id: data.device_id,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth_key: data.auth_key,
          prompts_per_day: data.prompts_per_day,
          start_hour: data.start_hour,
          end_hour: data.end_hour,
          timezone: data.timezone,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "device_id,endpoint" },
      );
      if (error) {
        return { ok: false as const, reason: "Couldn't save this device's reminders." };
      }
    }

    const { sendPush } = await import("@/lib/send-push.server");
    const delivery = await sendPush(
      { endpoint: data.endpoint, p256dh: data.p256dh, auth_key: data.auth_key },
      privateKey,
      origin,
      "Test reminder — your jaw check-ins are working.",
    );
    await supabaseAdmin
      .from("push_delivery_failures")
      .insert({
        endpoint: data.endpoint,
        status: delivery.status,
        detail: delivery.detail
          ? `manual test send: ${delivery.detail}`.slice(0, 300)
          : "manual test send",
      })
      .then(() => undefined, () => undefined);

    if (delivery.status >= 400) {
      return {
        ok: false as const,
        reason: `The push service rejected it (${delivery.status}). Turning reminders off and on usually repairs this.`,
      };
    }
    return { ok: true as const };
  });
