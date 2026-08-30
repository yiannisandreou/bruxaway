import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { CONTEXTS, behaviorById, peakWindow, useEntries, useHydrated } from "@/lib/ema";

export const Route = createFileRoute("/cues")({
  head: () => ({
    meta: [
      { title: "Cues & Jaw Reset — Unclench" },
      {
        name: "description",
        content:
          "Find the situations that trigger your awake bruxism and run a guided 30-second jaw reset to release clenching.",
      },
      { property: "og:title", content: "Cues & Jaw Reset — Unclench" },
      {
        property: "og:description",
        content: "Your top clenching triggers plus a guided 30-second jaw relaxation sequence.",
      },
    ],
  }),
  component: CuesPage,
});

const RESET_STEPS = [
  { label: "Notice", detail: "Where are your teeth right now? Let them part slightly.", secs: 8 },
  { label: "Release", detail: "Tongue rests behind the upper teeth, lips together, jaw heavy.", secs: 8 },
  { label: "Breathe", detail: "Inhale through the nose for 4, out slowly for 6.", secs: 10 },
  { label: "Soften", detail: "Drop the shoulders, unfurrow the brow, keep the jaw loose.", secs: 4 },
];

function CuesPage() {
  const hydrated = useHydrated();
  const { entries } = useEntries();
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const total = RESET_STEPS.reduce((s, x) => s + x.secs, 0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= total) {
          window.clearInterval(id);
          setRunning(false);
          return total;
        }
        return e + 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, total]);

  let acc = 0;
  const activeIndex = RESET_STEPS.findIndex((s) => {
    acc += s.secs;
    return elapsed < acc;
  });

  const triggers = useMemo(() => {
    const episodes = entries.filter((e) => behaviorById(e.behavior).episode);
    return CONTEXTS.map((c) => {
      const count = episodes.filter((e) => e.contexts.includes(c)).length;
      return { context: c, count, share: episodes.length ? count / episodes.length : 0 };
    })
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [entries]);

  const peak = useMemo(() => peakWindow(entries), [entries]);
  const maxTrigger = Math.max(1, ...triggers.map((t) => t.count));

  return (
    <AppShell title="Cues & resets" eyebrow="Cues · what sets the jaw off">
      <section className="mx-5 rounded-3xl bg-brand px-5 pt-4 pb-5 text-cream shadow-brand">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber">
          30-second jaw reset
        </p>
        <p className="mt-2 font-display text-[26px] leading-tight">
          {running || elapsed > 0
            ? RESET_STEPS[activeIndex === -1 ? RESET_STEPS.length - 1 : activeIndex]!.label
            : "Teeth apart, lips together"}
        </p>
        <p className="mt-2 min-h-10 text-[13px] text-cream/75">
          {running || elapsed > 0
            ? RESET_STEPS[activeIndex === -1 ? RESET_STEPS.length - 1 : activeIndex]!.detail
            : "A short sequence to unclench and reset resting jaw posture."}
        </p>
        <div className="mt-4 h-1.5 rounded-full bg-cream/20">
          <div
            className="h-full rounded-full bg-amber transition-all duration-1000 ease-linear"
            style={{ width: `${(elapsed / total) * 100}%` }}
          />
        </div>
        <button
          onClick={() => {
            if (elapsed >= total) setElapsed(0);
            setRunning((r) => !r);
          }}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cream text-[15px] font-semibold text-brand"
        >
          <span className="size-2 rounded-full bg-amber" />
          {running ? "Pause" : elapsed > 0 && elapsed < total ? "Resume" : "Start reset"}
        </button>
      </section>

      <section className="mx-5 mt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">
          Your top triggers
        </p>
        {hydrated && triggers.length === 0 && (
          <p className="mt-2 text-[13px] text-ink/55">
            Tag the situation when you log a check-in and your triggers will surface here.
          </p>
        )}
        <div className="mt-3 space-y-3">
          {triggers.map((t) => (
            <div key={t.context}>
              <div className="flex justify-between text-[13px]">
                <span className="font-semibold">{t.context}</span>
                <span className="text-ink/50">{Math.round(t.share * 100)}%</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-sand">
                <div
                  className="h-full rounded-full bg-clay transition-all duration-700"
                  style={{ width: `${(t.count / maxTrigger) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-5 mt-6 rounded-2xl bg-sand/70 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-clay">
          Habit reversal
        </p>
        <p className="mt-1 text-[13px] leading-snug">
          {peak
            ? `Set a soft reminder before ${peak.label} — the window where your jaw activity concentrates — and run a reset ahead of it.`
            : "Pair each prompt with a check of resting posture: teeth apart, tongue up, jaw heavy."}
        </p>
      </section>

      <section className="mx-5 mt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">
          Everyday anchors
        </p>
        <ul className="mt-2 divide-y divide-clay/15 text-[13px]">
          {[
            "Screens: place a small dot on the monitor edge as a jaw-check cue.",
            "Driving: relax the grip on the wheel and the jaw follows.",
            "Desk work: exhale before replying to a hard message.",
            "Evening: warm compress on the masseter for two minutes.",
          ].map((tip) => (
            <li key={tip} className="py-2.5 leading-snug text-ink/75">
              {tip}
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
