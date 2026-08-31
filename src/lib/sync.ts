import { supabase } from "@/integrations/supabase/client";
import {
  allLocalEntries,
  mergeLocalEntries,
  type BehaviorId,
  type Entry,
} from "@/lib/ema";

type Row = {
  id: string;
  ts: string;
  behavior: string;
  contexts: string[] | null;
  stress: number;
  note: string | null;
  prompted: boolean;
};

export const rowToEntry = (row: Row): Entry => ({
  id: row.id,
  ts: new Date(row.ts).getTime(),
  behavior: row.behavior as BehaviorId,
  contexts: row.contexts ?? [],
  stress: row.stress,
  ...(row.note ? { note: row.note } : {}),
  prompted: row.prompted,
});

const entryToRow = (entry: Entry, userId: string) => ({
  id: entry.id,
  user_id: userId,
  ts: new Date(entry.ts).toISOString(),
  behavior: entry.behavior,
  contexts: entry.contexts,
  stress: entry.stress,
  note: entry.note ?? null,
  prompted: entry.prompted,
});

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * Marks the most recent unanswered reminder as answered when a prompted
 * check-in comes in, so adherence reflects reminders responded to rather than
 * raw entry count.
 */
async function markPromptAnswered(userId: string, at: number) {
  const since = new Date(at - 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("prompt_events")
    .select("id")
    .eq("user_id", userId)
    .eq("answered", false)
    .gte("fired_at", since)
    .lte("fired_at", new Date(at).toISOString())
    .order("fired_at", { ascending: false })
    .limit(1);
  const id = data?.[0]?.id;
  if (id) await supabase.from("prompt_events").update({ answered: true }).eq("id", id);
}

/** Upserts entries to the cloud when signed in; silently no-ops otherwise. */
export async function pushEntries(entries: Entry[]) {
  const userId = await currentUserId();
  if (!userId || !entries.length) return;
  await supabase.from("entries").upsert(entries.map((e) => entryToRow(e, userId)));
  const prompted = entries.filter((e) => e.prompted).sort((a, b) => b.ts - a.ts)[0];
  if (prompted) await markPromptAnswered(userId, prompted.ts).catch(() => undefined);
}

/** Reminders fired vs answered for a patient over the last `days` days. */
export async function fetchPromptAdherence(patientId: string, days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from("prompt_events")
    .select("answered")
    .eq("user_id", patientId)
    .gte("fired_at", since);
  if (error) return { sent: 0, answered: 0 };
  const rows = data ?? [];
  return { sent: rows.length, answered: rows.filter((r) => r.answered).length };
}


export async function deleteEntry(id: string) {
  const userId = await currentUserId();
  if (!userId) return;
  await supabase.from("entries").delete().eq("id", id).eq("user_id", userId);
}

/** Two-way merge of this device's check-ins with the account's cloud copy. */
export async function syncNow() {
  const userId = await currentUserId();
  if (!userId) return { synced: false as const, pulled: 0, pushed: 0 };

  const { data, error } = await supabase
    .from("entries")
    .select("id, ts, behavior, contexts, stress, note, prompted")
    .eq("user_id", userId);
  if (error) throw error;

  const remote = (data ?? []).map((r) => rowToEntry(r as Row));
  const pulled = mergeLocalEntries(remote);

  const remoteIds = new Set(remote.map((e) => e.id));
  const toPush = allLocalEntries().filter((e) => !remoteIds.has(e.id));
  await pushEntries(toPush);

  return { synced: true as const, pulled, pushed: toPush.length };
}

/** Read-only fetch of a linked patient's check-ins (physician view). */
export async function fetchPatientEntries(patientId: string) {
  const { data, error } = await supabase
    .from("entries")
    .select("id, ts, behavior, contexts, stress, note, prompted")
    .eq("user_id", patientId)
    .order("ts", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToEntry(r as Row));
}
