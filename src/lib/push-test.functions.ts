import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Sends one reminder immediately to an endpoint that is already subscribed.
 * Deliberately unauthenticated (reminders work without an account), but it can
 * only target subscriptions that already exist server-side, so it can't be used
 * to push to arbitrary endpoints.
 */
export const sendTestPush = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ endpoint: z.string().url().startsWith("https://") }).parse(input),
  )
  .handler(async ({ data }) => {
    const privateKey = process.env["VAPID_PRIVATE_KEY"];
    const origin = process.env["PUBLIC_ORIGIN"] ?? "https://bruxaway.lovable.app";
    if (!privateKey) return { ok: false as const, reason: "Push is not configured." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [user, device] = await Promise.all([
      supabaseAdmin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth_key")
        .eq("endpoint", data.endpoint)
        .maybeSingle(),
      supabaseAdmin
        .from("device_push_subscriptions")
        .select("endpoint, p256dh, auth_key")
        .eq("endpoint", data.endpoint)
        .maybeSingle(),
    ]);
    const target = user.data ?? device.data;
    if (!target) {
      return { ok: false as const, reason: "This device isn't subscribed to reminders yet." };
    }

    const { sendPush } = await import("@/lib/send-push.server");
    const delivery = await sendPush(
      target,
      privateKey,
      origin,
      "Test reminder — your jaw check-ins are working.",
    );
    await supabaseAdmin
      .from("push_delivery_failures")
      .insert({
        endpoint: target.endpoint,
        status: delivery.status,
        detail: delivery.detail
          ? `manual test send: ${delivery.detail}`.slice(0, 300)
          : "manual test send",
      })
      .then(() => undefined, () => undefined);

    if (delivery.status >= 400) {
      return { ok: false as const, reason: `Push service rejected it (${delivery.status}).` };
    }
    return { ok: true as const };
  });
