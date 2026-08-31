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

type Target = {
  user_id: string | null;
  device_id: string | null;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  prompts_per_day: number;
  start_hour: number;
  end_hour: number;
  timezone: string;
  local_now: string;
  local_date: string;
  last_fired_at: string | null;
};

type Slot = { id: string; slot_local: string; fired: boolean };

/** Minutes since local midnight from a Postgres `timestamp` string. */
function minuteOfDay(ts: string): number {
  const time = ts.includes("T") ? ts.split("T")[1]! : ts.split(" ")[1]!;
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

const MIN_GAP_MINUTES = 45;

/**
 * Places `count` prompt times across the waking window: one random minute
 * inside each evenly-sized block, then a minimum spacing pass. Spreading the
 * quota up front (instead of drawing per tick) guarantees morning, afternoon
 * and evening coverage and prevents the whole day being spent before noon.
 */
function buildSlots(startHour: number, endHour: number, count: number): number[] {
  const start = startHour * 60;
  const end = (endHour > startHour ? endHour : startHour + 1) * 60;
  const n = Math.max(1, count);
  const block = (end - start) / n;
  const slots: number[] = [];
  for (let i = 0; i < n; i++) {
    const from = start + i * block + block * 0.1;
    const span = block * 0.8;
    slots.push(Math.round(from + Math.random() * span));
  }
  slots.sort((a, b) => a - b);
  const gap = Math.min(MIN_GAP_MINUTES, Math.max(10, Math.floor(block)));
  for (let i = 1; i < slots.length; i++) {
    if (slots[i]! - slots[i - 1]! < gap) slots[i] = slots[i - 1]! + gap;
  }
  return slots.filter((m) => m < end - 1);
}

/**
 * Every skip, failure and send is recorded so a reminder that never went out is
 * visible in diagnostics instead of disappearing silently.
 */
async function logDelivery(
  admin: { from: (t: "push_delivery_failures") => any },
  endpoint: string,
  detail: string,
  status?: number,
) {
  await admin
    .from("push_delivery_failures")
    .insert({ endpoint, status: status ?? null, detail: detail.slice(0, 300) })
    .then(
      () => undefined,
      () => undefined,
    );
}

function slotStamp(localDate: string, minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${localDate} ${h}:${m}:00`;
}

/**
 * Called every few minutes by pg_cron with the LOVABLE_CRON_SECRET bearer token.
 *
 * Each patient/device gets a per-day schedule of prompt times spread across
 * their local waking window; every tick fires whichever slot has come due,
 * respecting a minimum gap so prompts never bunch or double up.
 */
async function promptHandler({ request }: { request: Request }) {
  const authed = await authenticateCronRequest(request);
  if (authed) return authed;

  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  if (!privateKey) return new Response("VAPID_PRIVATE_KEY not configured", { status: 500 });

  const origin = new URL(request.url).origin;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("prompt_targets");
  if (error) return new Response("query error", { status: 500 });

  const targets = (data ?? []) as Target[];
  let fired = 0;

  for (const row of targets) {
    const nowMin = minuteOfDay(row.local_now);

    // Ensure today's schedule exists.
    const { data: existing } = await supabaseAdmin
      .from("prompt_schedule")
      .select("id, slot_local, fired")
      .eq("local_date", row.local_date)
      .eq(row.user_id ? "user_id" : "device_id", (row.user_id ?? row.device_id)!);

    let slots = (existing ?? []) as Slot[];
    if (slots.length === 0) {
      const minutes = buildSlots(row.start_hour, row.end_hour, row.prompts_per_day);
      if (minutes.length === 0) continue;
      const { data: inserted } = await supabaseAdmin
        .from("prompt_schedule")
        .insert(
          minutes.map((m) => ({
            user_id: row.user_id,
            device_id: row.device_id,
            local_date: row.local_date,
            slot_local: slotStamp(row.local_date, m),
          })),
        )
        .select("id, slot_local, fired");
      slots = (inserted ?? []) as Slot[];
      // Slots already in the past when the schedule is created (app installed
      // mid-day) are retired so they can't fire as a burst.
      const stale = slots.filter((s) => minuteOfDay(s.slot_local) <= nowMin);
      if (stale.length) {
        await supabaseAdmin
          .from("prompt_schedule")
          .update({ fired: true })
          .in("id", stale.map((s) => s.id));
        const staleIds = new Set(stale.map((s) => s.id));
        slots = slots.filter((s) => !staleIds.has(s.id));
      }
    }

    const due = slots
      .filter((s) => !s.fired && minuteOfDay(s.slot_local) <= nowMin)
      .sort((a, b) => minuteOfDay(a.slot_local) - minuteOfDay(b.slot_local));
    if (due.length === 0) continue;

    // Pacing: never two prompts inside the minimum gap of a *successful* send.
    if (row.last_fired_at) {
      const since = (Date.now() - new Date(row.last_fired_at).getTime()) / 60000;
      if (since < MIN_GAP_MINUTES) {
        await logDelivery(
          supabaseAdmin,
          row.endpoint,
          `skipped slot ${due[0]!.slot_local}: only ${Math.round(since)} min since last send`,
        );
        continue;
      }
    }

    // Exactly one slot per tick; the freshest due slot is the one that matches
    // "right now". Slots are only retired once the push has been accepted, so a
    // failed tick leaves them due and the next tick retries instead of losing
    // the reminder for the day.
    const target = due[due.length - 1]!;
    const superseded = due.slice(0, -1);

    const { error: insErr } = await supabaseAdmin.from("prompt_events").insert({
      user_id: row.user_id,
      device_id: row.device_id,
      fired_at: new Date().toISOString(),
    });
    if (insErr) {
      await logDelivery(
        supabaseAdmin,
        row.endpoint,
        `slot ${target.slot_local} retained: record failed (${insErr.message})`,
      );
      continue;
    }

    try {
      const { sendPush } = await import("@/lib/send-push.server");
      const delivery = await sendPush(row, privateKey, origin);
      await logDelivery(
        supabaseAdmin,
        row.endpoint,
        delivery.detail ? `cron send: ${delivery.detail}` : "cron send",
        delivery.status,
      );
      const accepted = delivery.status >= 200 && delivery.status < 300;
      if (accepted) {
        await supabaseAdmin
          .from("prompt_schedule")
          .update({ fired: true })
          .in("id", [target, ...superseded].map((s) => s.id));
        fired++;
      } else {
        await logDelivery(
          supabaseAdmin,
          row.endpoint,
          `slot ${target.slot_local} retained for retry (status ${delivery.status})`,
          delivery.status,
        );
      }
      if (
        delivery.status === 400 ||
        delivery.status === 404 ||
        delivery.status === 410
      ) {
        // Subscription is dead (reinstall, revoked permission, stale VAPID key)
        // — prune it so cron stops hammering an endpoint that can't succeed.
        await supabaseAdmin.from("push_delivery_failures").insert({
          endpoint: row.endpoint,
          status: delivery.status,
          detail: "pruned expired subscription",
        });
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
    } catch (err) {
      await supabaseAdmin
        .from("push_delivery_failures")
        .insert({ endpoint: row.endpoint, detail: String(err).slice(0, 300) })
        .then(() => undefined, () => undefined);
    }
    fired++;
  }

  return Response.json({ fired, eligible: targets.length });
}
