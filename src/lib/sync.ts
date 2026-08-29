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

/** Upserts entries to the cloud when signed in; silently no-ops otherwise. */
export async function pushEntries(entries: Entry[]) {
  const userId = await currentUserId();
  if (!userId || !entries.length) return;
  await supabase.from("entries").upsert(entries.map((e) => entryToRow(e, userId)));
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
