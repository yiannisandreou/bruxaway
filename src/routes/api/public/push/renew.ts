import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Called by the service worker when the browser renews (rotates) this device's
 * push subscription. Without this, the stored record points at a dead endpoint
 * and the device silently stops receiving reminders.
 *
 * Public by necessity: the service worker has no user session. The caller must
 * present the *old* endpoint it is replacing, and we only ever move a record
 * that already exists — so this can't be used to register arbitrary targets.
 */
const Body = z.object({
  old_endpoint: z.string().url().startsWith("https://"),
  endpoint: z.string().url().startsWith("https://"),
  p256dh: z.string().min(1).max(200),
  auth_key: z.string().min(1).max(200),
});

export const Route = createFileRoute("/api/public/push/renew")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("bad request", { status: 400 });
        const data = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();

        const { data: acct } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id")
          .eq("endpoint", data.old_endpoint)
          .limit(1);
        if (acct?.length) {
          await supabaseAdmin
            .from("push_subscriptions")
            .update({
              endpoint: data.endpoint,
              p256dh: data.p256dh,
              auth_key: data.auth_key,
              updated_at: now,
            })
            .eq("id", acct[0]!.id);
          return Response.json({ ok: true, moved: "account" });
        }

        const { data: dev } = await supabaseAdmin
          .from("device_push_subscriptions")
          .select("id")
          .eq("endpoint", data.old_endpoint)
          .limit(1);
        if (dev?.length) {
          await supabaseAdmin
            .from("device_push_subscriptions")
            .update({
              endpoint: data.endpoint,
              p256dh: data.p256dh,
              auth_key: data.auth_key,
              updated_at: now,
            })
            .eq("id", dev[0]!.id);
          return Response.json({ ok: true, moved: "device" });
        }

        // Nothing to move — the app repairs itself on next open.
        return Response.json({ ok: true, moved: "none" });
      },
    },
  },
});
