import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Reports whether the server actually holds a reminder record for this
 * endpoint, plus how many prompts fired today. Used to replace the ambiguous
 * "reminders on" toggle state with the truth. Unauthenticated by design
 * (reminders work without an account); it only echoes back facts about an
 * endpoint the caller already owns.
 */
export const pushRegistrationStatus = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        endpoint: z.string().url().startsWith("https://"),
        device_id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: acct } = await supabaseAdmin
      .from("push_subscriptions")
      .select("user_id")
      .eq("endpoint", data.endpoint)
      .limit(1);

    if (acct?.length) {
      const userId = acct[0]!.user_id;
      const [{ count }, { data: role }] = await Promise.all([
        supabaseAdmin
          .from("prompt_events")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("fired_at", new Date(Date.now() - 18 * 3600_000).toISOString()),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
      ]);
      const isPatient = (role ?? []).some((r) => r.role === "patient");
      return {
        registered: true as const,
        kind: "account" as const,
        isPatient,
        firedToday: count ?? 0,
      };
    }

    const { data: dev } = await supabaseAdmin
      .from("device_push_subscriptions")
      .select("device_id")
      .eq("endpoint", data.endpoint)
      .limit(1);

    if (dev?.length) {
      const { count } = await supabaseAdmin
        .from("prompt_events")
        .select("id", { count: "exact", head: true })
        .eq("device_id", dev[0]!.device_id)
        .gte("fired_at", new Date(Date.now() - 18 * 3600_000).toISOString());
      return {
        registered: true as const,
        kind: "device" as const,
        isPatient: true,
        firedToday: count ?? 0,
      };
    }

    return { registered: false as const, kind: null, isPatient: true, firedToday: 0 };
  });
