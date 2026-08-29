import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { AppShell } from "@/components/AppShell";
import {
  BEHAVIORS,
  behaviorById,
  hourlyClusters,
  lastNDays,
  peakWindow,
  useEntries,
  useHydrated,
  useSettings,
} from "@/lib/ema";

export const Route = createFileRoute("/trends")({
  head: () => ({
    meta: [
      { title: "Trends — Unclench awake bruxism tracker" },
      {
        name: "description",
        content:
          "See 14-day awake bruxism trends: episode frequency, behaviour breakdown, time-of-day clusters and prompt adherence.",
      },
      { property: "og:title", content: "Trends — Unclench awake bruxism tracker" },
      {
        property: "og:description",
        content: "Episode frequency, behaviour mix and time-of-day clusters from your jaw check-ins.",
      },
    ],
  }),
  component: TrendsPage,
});

function TrendsPage() {
  const hydrated = useHydrated();
  const { entries } = useEntries();
  const { settings } = useSettings();

  const days = useMemo(() => lastNDays(entries, 14), [entries]);
  const totalReports = days.reduce((s, d) => s + d.reports, 0);
  const totalEpisodes = days.reduce((s, d) => s + d.episodes, 0);
  const expected = settings.promptsPerDay * 14;
  const adherence = expected ? Math.min(100, Math.round((totalReports / expected) * 100)) : 0;
  const maxDay = Math.max(1, ...days.map((d) => d.reports));
  const hours = useMemo(() => hourlyClusters(entries), [entries]);
  const maxHour = Math.max(1, ...hours);
  const peak = useMemo(() => peakWindow(entries), [entries]);

  const mix = BEHAVIORS.map((b) => {
    const count = entries.filter((e) => e.behavior === b.id).length;
    return { ...b, count, share: entries.length ? count / entries.length : 0 };
  }).sort((a, b) => b.count - a.count);

  const avgTension = entries.length
    ? (entries.reduce((s, e) => s + e.stress, 0) / entries.length).toFixed(1)
    : "—";

  return (
    <AppShell title="Your patterns" eyebrow="Trends · last 14 days">
      <section className="mx-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-brand px-4 py-4 text-cream shadow-brand-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber">
            Episodes
          </p>
          <p className="mt-2 font-display text-[34px] leading-none">
            {hydrated ? totalEpisodes : "—"}
          </p>
          <p className="mt-1 text-[12px] text-cream/70">of {totalReports} reports</p>
        </div>
        <div className="rounded-2xl bg-sand/70 px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-clay">
            Adherence
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="relative size-14 shrink-0">
              <svg viewBox="0 0 80 80" className="size-14 -rotate-90">
                <circle cx="40" cy="40" r="32" fill="none" stroke="var(--clay)" strokeOpacity="0.3" strokeWidth="7" />
                <circle
                  cx="40"
                  cy="40"
                  r="32"
                  fill="none"
                  stroke="var(--brand)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={201}
                  strokeDashoffset={201 - (201 * (hydrated ? adherence : 0)) / 100}
                  style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.2,.7,.2,1)" }}
                />
              </svg>
              <span className="absolute inset-0 grid place-items-center text-[12px] font-bold text-brand">
                {hydrated ? `${adherence}%` : "—"}
              </span>
            </div>
            <p className="text-[12px] leading-snug text-ink/60">
              {settings.promptsPerDay} prompts a day
            </p>
          </div>
        </div>
      </section>

      <section className="mx-5 mt-5">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">
            Reports per day
          </p>
          <p className="text-[11px] text-ink/45">amber = episodes</p>
        </div>
        <div className="mt-3 flex h-32 items-end gap-1.5">
          {days.map((d) => (
            <div key={d.date.toISOString()} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-md bg-sand"
                  style={{ height: `${hydrated ? (d.reports / maxDay) * 100 : 0}%` }}
                />
                <div
                  className="absolute bottom-0 w-full rounded-t-md bg-amber transition-all duration-500"
                  style={{ height: `${hydrated ? (d.episodes / maxDay) * 100 : 0}%` }}
                />
              </div>
              <span className="text-[8px] uppercase tracking-wide text-ink/40">
                {d.date.getDate()}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-5 mt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">
          Behaviour mix
        </p>
        <div className="mt-3 space-y-3">
          {mix.map((b) => (
            <div key={b.id}>
              <div className="flex justify-between text-[13px]">
                <span className="font-semibold">{b.label}</span>
                <span className="text-ink/50">
                  {b.count} · {Math.round(b.share * 100)}%
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-sand">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    b.episode ? "bg-brand" : "bg-moss"
                  }`}
                  style={{ width: `${hydrated ? b.share * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-5 mt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">
          Time of day
        </p>
        <div className="mt-3 flex h-24 items-end gap-[3px]">
          {hours.map((v, h) => (
            <div
              key={h}
              title={`${h}:00 · ${v} episodes`}
              className="flex-1 rounded-sm bg-clay/25"
              style={{
                height: `${Math.max(4, hydrated ? (v / maxHour) * 100 : 4)}%`,
                backgroundColor:
                  v > 0 && v === maxHour ? "var(--brand)" : undefined,
              }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.12em] text-ink/40">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>23</span>
        </div>
        <p className="mt-3 rounded-2xl bg-sand/70 px-4 py-3 text-[13px] leading-snug">
          {peak
            ? `Peak window ${peak.label} with ${peak.count} episodes. Average tension ${avgTension}/5.`
            : "Keep answering prompts — your daily pattern appears after a handful of reports."}
        </p>
      </section>

      <section className="mx-5 mt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">
          Recent reports
        </p>
        <ul className="mt-2 divide-y divide-clay/15">
          {entries.slice(0, 12).map((e) => {
            const b = behaviorById(e.behavior);
            return (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <span className="w-14 shrink-0 text-[11px] text-ink/45">
                  {new Date(e.ts).toLocaleDateString([], { month: "short", day: "numeric" })}
                </span>
                <span className="text-[13px] font-semibold">{b.label}</span>
                <span className="ml-auto shrink-0 text-[11px] text-ink/45">
                  {e.contexts.join(", ") || "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </AppShell>
  );
}
