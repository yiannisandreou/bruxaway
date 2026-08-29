import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { ReportSheet } from "@/components/ReportSheet";
import {
  behaviorById,
  fmtTime,
  lastNDays,
  peakWindow,
  promptTimes,
  sameDay,
  streakDays,
  useEntries,
  useHydrated,
  useSettings,
} from "@/lib/ema";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Unclench — Awake Bruxism Momentary Assessment" },
      {
        name: "description",
        content:
          "Answer short prompts through the day to track clenching, grinding, teeth contact and jaw bracing, then see your awake bruxism patterns.",
      },
      { property: "og:title", content: "Unclench — Awake Bruxism Momentary Assessment" },
      {
        property: "og:description",
        content:
          "Ecological momentary assessment for awake bruxism: quick jaw check-ins and weekly patterns.",
      },
    ],
  }),
  component: NowPage,
});

function NowPage() {
  const hydrated = useHydrated();
  const { entries } = useEntries();
  const { settings } = useSettings();
  const [sheet, setSheet] = useState<null | { prompted: boolean }>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const today = useMemo(
    () => entries.filter((e) => sameDay(e.ts, now.getTime())),
    [entries, now],
  );
  const todayEpisodes = today.filter((e) => behaviorById(e.behavior).episode).length;
  const week = useMemo(() => lastNDays(entries, 7, now), [entries, now]);
  const yesterday = week[week.length - 2];
  const delta =
    yesterday && yesterday.episodes > 0
      ? Math.round(((todayEpisodes - yesterday.episodes) / yesterday.episodes) * 100)
      : null;
  
  const scheduleToday = promptTimes(settings, now);
  const answered = today.filter((e) => e.prompted).length;
  const peak = useMemo(() => peakWindow(entries), [entries]);
  const streak = useMemo(() => streakDays(entries, now), [entries, now]);
  const maxDay = Math.max(1, ...week.map((d) => d.reports));

  return (
    <AppShell>
      <section className="mx-5 rounded-3xl bg-brand px-5 pt-4 pb-5 text-cream shadow-brand">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber">
          Today's rhythm
        </p>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="flex items-end gap-2">
              <span className="font-display text-[52px] leading-none">
                {hydrated ? todayEpisodes : "—"}
              </span>
              <span className="pb-2 text-sm text-cream/70">episodes</span>
            </div>
            <p className="mt-2 text-[13px] text-cream/75">
              {hydrated
                ? `${today.length} report${today.length === 1 ? "" : "s"} logged${
                    delta === null
                      ? ""
                      : ` · ${Math.abs(delta)}% ${delta <= 0 ? "down from" : "up on"} yesterday`
                  }`
                : "Loading your day…"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.14em] text-amber">Streak</p>
            <p className="mt-1 font-display text-2xl leading-none">
              {hydrated ? `${streak}d` : "—"}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {week.map((d) => {
            const height = d.reports / maxDay;
            return (
              <div
                key={d.date.toISOString()}
                className="h-9 overflow-hidden rounded-md bg-cream/20"
                title={`${d.reports} reports · ${d.episodes} episodes`}
              >
                <div
                  className="mt-auto h-full origin-bottom rounded-md bg-amber transition-transform duration-500"
                  style={{ transform: `scaleY(${hydrated ? Math.max(0.06, height) : 0})` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[9px] uppercase tracking-[0.12em] text-cream/55">
          {week.map((d) => (
            <span key={d.date.toISOString()}>
              {d.date.toLocaleDateString([], { weekday: "short" }).slice(0, 3)}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-5 mt-3 rounded-2xl bg-sand/70 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-clay">
          Today's progress
        </p>
        <p className="mt-1 text-[13px] leading-snug">
          {answered}/{settings.promptsPerDay} of today's prompts answered.{" "}
          {peak
            ? `Your episodes cluster around ${peak.label}.`
            : "A few days of reports will reveal your patterns."}
        </p>
      </section>

      <button
        onClick={() => setSheet({ prompted: false })}
        className="mx-5 mt-3 flex h-14 w-[calc(100%-2.5rem)] items-center justify-center gap-2 rounded-2xl bg-brand text-[16px] font-semibold tracking-wide text-cream shadow-brand-sm"
      >
        <span className="size-2.5 rounded-full bg-amber" />
        Log a jaw check-in
      </button>

      <Link
        to="/cues"
        className="mx-5 mt-3 flex h-12 w-[calc(100%-2.5rem)] items-center justify-center gap-2 rounded-2xl border border-clay/40 text-[15px] font-semibold text-brand"
      >
        <span className="size-2 rounded-full bg-clay" />
        Start a jaw reset
      </Link>

      <section className="mx-5 mt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">
          Today's reports
        </p>
        {hydrated && today.length === 0 && (
          <p className="mt-2 text-[13px] text-ink/55">
            No check-ins yet. Prompts run {settings.startHour}:00–{settings.endHour}:00.
          </p>
        )}
        <ul className="mt-2 divide-y divide-clay/15">
          {today.map((e) => {
            const b = behaviorById(e.behavior);
            return (
              <li key={e.id} className="flex items-center gap-3 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sand text-clay">
                  {b.glyph}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">{b.label}</span>
                  <span className="block text-[12px] text-ink/55">
                    Tension {e.stress}/5 · {fmtTime(e.ts)}
                  </span>
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-ink/45">
                  {e.contexts[0] ?? (e.prompted ? "Prompted" : "Self")}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mx-5 mt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">
          Prompt schedule
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {scheduleToday.map((t) => {
            const past = t.getTime() < now.getTime();
            return (
              <span
                key={t.toISOString()}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${
                  past ? "bg-sand/60 text-ink/45" : "border border-clay/30 text-ink/70"
                }`}
              >
                {fmtTime(t)}
              </span>
            );
          })}
        </div>
      </section>

      <ReportSheet
        open={sheet !== null}
        prompted={sheet?.prompted ?? false}
        onClose={() => setSheet(null)}
      />
    </AppShell>
  );
}
