import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Marks the reminder that preceded a check-in as answered, so adherence in the
 * clinician view reflects reminders responded to rather than raw entry count.
 * Runs server-side: the browser copy could fail silently whenever the local
 * session had expired, which is why no reminder was ever marked answered.
 */
export const markReminderAnswered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ at: z.number() }).parse(input))
  .handler(async ({ data, context }) => {
    const at = new Date(data.at);
    const since = new Date(data.at - 90 * 60 * 1000);
    const { data: rows } = await context.supabase
      .from("prompt_events")
      .select("id")
      .eq("user_id", context.userId)
      .eq("answered", false)
      .gte("fired_at", since.toISOString())
      .lte("fired_at", at.toISOString())
      .order("fired_at", { ascending: false })
      .limit(1);
    const id = rows?.[0]?.id;
    if (!id) return { marked: false as const };
    const { error } = await context.supabase
      .from("prompt_events")
      .update({ answered: true })
      .eq("id", id);
    return { marked: !error };
  });
