import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Persists this device's push subscription so the cron can deliver prompts to it. */
export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        endpoint: z.string().min(1),
        p256dh: z.string().min(1),
        auth_key: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // An endpoint belongs to exactly one browser install, so claim it for this
    // account and drop any stale rows that still point at it elsewhere. Also
    // retire this account's *other* endpoints: the daily prompt cap is counted
    // per person while sends go per stored endpoint, so leftover rows from
    // earlier installs would split the day's reminders across dead devices.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("device_push_subscriptions").delete().eq("endpoint", data.endpoint);
    await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .neq("user_id", context.userId);

    const { error } = await context.supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: context.userId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth_key: data.auth_key,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,endpoint" },
      );
    if (error) throw error;

    await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", context.userId)
      .neq("endpoint", data.endpoint);

    return { ok: true };
  });



/** Removes this device's push subscription (used when notifications are turned off). */
export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ endpoint: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", context.userId)
      .eq("endpoint", data.endpoint);
    return { ok: true };
  });

/**
 * Stores a push subscription for a device that has no account. Deliberately
 * unauthenticated: reminders must work without signing in. Writes go through
 * trusted server code only — the table has no client-reachable grants.
 */
export const saveDevicePushSubscription = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        device_id: z.string().uuid(),
        endpoint: z.string().url().startsWith("https://"),
        p256dh: z.string().min(1).max(200),
        auth_key: z.string().min(1).max(200),
        prompts_per_day: z.number().int().min(1).max(24),
        start_hour: z.number().int().min(0).max(23),
        end_hour: z.number().int().min(1).max(24),
        timezone: z.string().min(1).max(64),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // One endpoint belongs to one install: clear other endpoints for this device
    // and any other device/account rows still holding this endpoint.
    const { error: deleteError } = await supabaseAdmin
      .from("device_push_subscriptions")
      .delete()
      .eq("device_id", data.device_id)
      .neq("endpoint", data.endpoint);
    if (deleteError) throw deleteError;
    await supabaseAdmin
      .from("device_push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .neq("device_id", data.device_id);


    const { error } = await supabaseAdmin
      .from("device_push_subscriptions")
      .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: "device_id,endpoint" });
    if (error) throw error;
    return { ok: true };
  });

/** Removes an account-less device subscription (reminders turned off). */
export const removeDevicePushSubscription = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ device_id: z.string().uuid(), endpoint: z.string().url() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("device_push_subscriptions")
      .delete()
      .eq("device_id", data.device_id)
      .eq("endpoint", data.endpoint);
    return { ok: true };
  });
