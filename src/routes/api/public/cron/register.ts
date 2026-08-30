import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/register")({
  server: {
    handlers: {
      POST: registerHandler,
    },
  },
});

/**
 * One-time (and idempotent) setup call: copies the LOVABLE_CRON_SECRET into the
 * server-only cron_config row that the pg_cron job reads when building its
 * Authorization header. Authenticated with the same secret, so only a caller
 * that already knows it can refresh it.
 */
async function registerHandler({ request }: { request: Request }) {
  const authed = await authenticateCronRequest(request);
  if (authed) return authed;

  const secret = process.env["LOVABLE_CRON_SECRET"];
  if (!secret) return new Response("LOVABLE_CRON_SECRET not configured", { status: 500 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("cron_config")
    .upsert(
      { key: "cron_secret", value: secret, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) return new Response("store error", { status: 500 });

  return Response.json({ ok: true });
}
