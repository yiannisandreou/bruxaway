import { useCallback, useEffect, useState } from "react";

export type BehaviorId =
  | "relaxed"
  | "contact"
  | "clenching"
  | "grinding"
  | "bracing";

export type Behavior = {
  id: BehaviorId;
  label: string;
  hint: string;
  glyph: string;
  /** true when the report counts as an awake-bruxism episode */
  episode: boolean;
};

export const BEHAVIORS: Behavior[] = [
  {
    id: "relaxed",
    label: "Relaxed jaw",
    hint: "Teeth apart, muscles loose",
    glyph: "◡",
    episode: false,
  },
  {
    id: "contact",
    label: "Teeth contact",
    hint: "Teeth touching without force",
    glyph: "═",
    episode: true,
  },
  {
    id: "clenching",
    label: "Clenching",
    hint: "Teeth pressed together",
    glyph: "✱",
    episode: true,
  },
  {
    id: "grinding",
    label: "Grinding",
    hint: "Teeth sliding side to side",
    glyph: "⇄",
    episode: true,
  },
  {
    id: "bracing",
    label: "Jaw bracing",
    hint: "Jaw held or pushed forward",
    glyph: "⊿",
    episode: true,
  },
];

export const behaviorById = (id: BehaviorId) =>
  BEHAVIORS.find((b) => b.id === id) ?? BEHAVIORS[0]!;

export const CONTEXTS = [
  "Work",
  "Screen time",
  "Driving",
  "Commuting",
  "Chores",
  "Exercise",
  "Resting",
  "Socialising",
] as const;

export type Entry = {
  id: string;
  ts: number;
  behavior: BehaviorId;
  contexts: string[];
  stress: number; // 1..5
  note?: string;
  prompted: boolean;
};

export type Settings = {
  name: string;
  promptsPerDay: number;
  startHour: number;
  endHour: number;
  notifications: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  name: "",
  promptsPerDay: 8,
  startHour: 8,
  endHour: 22,
  notifications: false,
};

const ENTRIES_KEY = "unclench.entries.v1";
const SETTINGS_KEY = "unclench.settings.v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function readList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

const EVENT = "unclench:change";

function broadcast() {
  window.dispatchEvent(new Event(EVENT));
}

export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

export function useEntries() {
  const [entries, setEntries] = useState<Entry[]>([]);

  const sync = useCallback(() => {
    setEntries(
      readList<Entry>(ENTRIES_KEY).sort((a, b) => b.ts - a.ts),
    );
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [sync]);

  const addEntry = useCallback((entry: Omit<Entry, "id" | "ts"> & { ts?: number }) => {
    const next: Entry = {
      id: crypto.randomUUID(),
      ts: entry.ts ?? Date.now(),
      behavior: entry.behavior,
      contexts: entry.contexts,
      stress: entry.stress,
      ...(entry.note ? { note: entry.note } : {}),
      prompted: entry.prompted,
    };
    const all = [...readList<Entry>(ENTRIES_KEY), next];
    window.localStorage.setItem(ENTRIES_KEY, JSON.stringify(all));
    broadcast();
    void import("@/lib/sync").then((m) => m.pushEntries([next]));
    return next;
  }, []);

  const removeEntry = useCallback((id: string) => {
    const all = readList<Entry>(ENTRIES_KEY).filter((e) => e.id !== id);
    window.localStorage.setItem(ENTRIES_KEY, JSON.stringify(all));
    broadcast();
    void import("@/lib/sync").then((m) => m.deleteEntry(id));
  }, []);


  const clearAll = useCallback(() => {
    window.localStorage.removeItem(ENTRIES_KEY);
    broadcast();
  }, []);

  return { entries, addEntry, removeEntry, clearAll };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const sync = useCallback(() => {
    setSettings(read<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS));
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [sync]);

  const update = useCallback((patch: Partial<Settings>) => {
    const next = { ...read<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS), ...patch };
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    broadcast();
  }, []);

  return { settings, update };
}

/* ── derived helpers ───────────────────────────────────────────────────── */

export const startOfDay = (d: Date | number) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const sameDay = (a: number, b: number) =>
  startOfDay(a).getTime() === startOfDay(b).getTime();

export function promptTimes(settings: Settings, base = new Date()) {
  const { promptsPerDay, startHour, endHour } = settings;
  const span = Math.max(1, endHour - startHour);
  const step = span / Math.max(1, promptsPerDay);
  return Array.from({ length: promptsPerDay }, (_, i) => {
    const t = startOfDay(base);
    const hours = startHour + step * (i + 0.5);
    t.setMinutes(Math.round(hours * 60));
    return t;
  });
}

export function nextPromptTime(settings: Settings, now = new Date()) {
  const today = promptTimes(settings, now).find((t) => t.getTime() > now.getTime());
  if (today) return today;
  const tomorrow = new Date(now.getTime() + 86_400_000);
  return promptTimes(settings, tomorrow)[0]!;
}

export const fmtTime = (d: Date | number) =>
  new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return { part: "Morning", hello: "Good morning" };
  if (h < 18) return { part: "Afternoon", hello: "Good afternoon" };
  return { part: "Dusk", hello: "Good evening" };
}

export type DayStat = {
  date: Date;
  reports: number;
  episodes: number;
  rate: number; // share of reports that were episodes
};

export function lastNDays(entries: Entry[], n: number, now = new Date()): DayStat[] {
  return Array.from({ length: n }, (_, i) => {
    const date = startOfDay(now.getTime() - (n - 1 - i) * 86_400_000);
    const dayEntries = entries.filter((e) => sameDay(e.ts, date.getTime()));
    const episodes = dayEntries.filter((e) => behaviorById(e.behavior).episode).length;
    return {
      date,
      reports: dayEntries.length,
      episodes,
      rate: dayEntries.length ? episodes / dayEntries.length : 0,
    };
  });
}

export function streakDays(entries: Entry[], now = new Date()) {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const day = startOfDay(now.getTime() - i * 86_400_000).getTime();
    const has = entries.some((e) => sameDay(e.ts, day));
    if (has) streak++;
    else if (i > 0) break;
  }
  return streak;
}

export function hourlyClusters(entries: Entry[]) {
  const buckets = new Array(24).fill(0) as number[];
  entries
    .filter((e) => behaviorById(e.behavior).episode)
    .forEach((e) => {
      buckets[new Date(e.ts).getHours()] = (buckets[new Date(e.ts).getHours()] ?? 0) + 1;
    });
  return buckets;
}

export function peakWindow(entries: Entry[]) {
  const buckets = hourlyClusters(entries);
  let best = -1;
  let bestVal = 0;
  for (let h = 0; h < 22; h++) {
    const v = (buckets[h] ?? 0) + (buckets[h + 1] ?? 0) + (buckets[h + 2] ?? 0);
    if (v > bestVal) {
      bestVal = v;
      best = h;
    }
  }
  if (best < 0 || bestVal === 0) return null;
  const label = (h: number) => {
    const suffix = h >= 12 ? "pm" : "am";
    const hr = h % 12 === 0 ? 12 : h % 12;
    return `${hr}${suffix}`;
  };
  return { from: best, to: best + 3, label: `${label(best)}–${label(best + 3)}`, count: bestVal };
}
