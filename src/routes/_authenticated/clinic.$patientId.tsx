import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  BEHAVIORS,
  behaviorById,
  fmtTime,
  hourlyClusters,
  lastNDays,
  peakWindow,
  streakDays,
  type Entry,
} from "@/lib/ema";
import { fetchPatientEntries, fetchPromptAdherence } from "@/lib/sync";

export const Route = createFileRoute("/_authenticated/clinic/$patientId")({
  head: () => ({
    meta: [
      { title: "Patient record — Unclench clinician view" },
      {
        name: "description",
        content:
          "Read-only patient record: awake bruxism episode trends, behaviour mix, time-of-day clusters and the full check-in log.",
      },
      { property: "og:title", content: "Patient record — Unclench clinician view" },
      {
        property: "og:description",
        content: "Episode trends, behaviour mix and full check-in log for one patient.",
      },
    ],
  }),
  component: PatientPage,
});

function PatientPage() {
  const { patientId } = Route.useParams();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [adherence, setAdherence] = useState({
    sent: 0,
    answered: 0,
    todaySent: 0,
    todayAnswered: 0,
  });
  const [profile, setProfile] = useState<{ full_name: string | null; email: string | null } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [rows, { data }, stats] = await Promise.all([
          fetchPatientEntries(patientId),
          supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", patientId)
            .maybeSingle(),
          fetchPromptAdherence(patientId),
        ]);
        if (!alive) return;
        setEntries(rows);
        setProfile(data ?? null);
        setAdherence(stats);

      } catch {
        if (alive) setError("You don't have access to this patient's record.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [patientId]);

  const days = useMemo(() => lastNDays(entries, 14), [entries]);
  const hours = useMemo(() => hourlyClusters(entries), [entries]);
  const peak = useMemo(() => peakWindow(entries), [entries]);
  const maxDay = Math.max(1, ...days.map((d) => d.reports));
  const maxHour = Math.max(1, ...hours);
  const episodes = entries.filter((e) => behaviorById(e.behavior).episode).length;
  const avgTension = entries.length
    ? (entries.reduce((s, e) => s + e.stress, 0) / entries.length).toFixed(1)
    : "—";
  const mix = BEHAVIORS.map((b) => {
    const count = entries.filter((e) => e.behavior === b.id).length;
    return { ...b, count, share: entries.length ? count / entries.length : 0 };
  }).sort((a, b) => b.count - a.count);

  const exportCsv = () => {
    const rows = [
      ["timestamp", "behaviour", "episode", "contexts", "tension", "prompted"],
      ...entries.map((e) => [
        new Date(e.ts).toISOString(),
        behaviorById(e.behavior).label,
        String(behaviorById(e.behavior).episode),
        e.contexts.join("|"),
        String(e.stress),
        String(e.prompted),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `unclench-patient-${patientId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 pt-6 pb-16 text-ink">
      <Link to="/clinic" className="text-[12px] font-semibold text-clay">
        ← Caseload
      </Link>
      <h1 className="mt-2 font-display text-[24px] font-medium leading-tight">
        {profile?.full_name || profile?.email || "Patient record"}
      </h1>
      <p className="mt-1 text-[12px] text-ink/50">Read-only · {entries.length} check-ins</p>

      {loading && <p className="mt-6 text-[13px] text-ink/45">Loading record…</p>}
      {error && <p className="mt-6 text-[13px] text-brand">{error}</p>}

      {!loading && !error && (
        <>
          <section className="mt-5 grid grid-cols-4 gap-2 text-center">
            {[
              { label: "Reports", value: entries.length },
              { label: "Episodes", value: episodes },
              { label: "Tension", value: avgTension },
              { label: "Streak", value: `${streakDays(entries)}d` },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-sand/70 px-1 py-3">
                <p className="font-display text-[19px] leading-none text-brand">{s.value}</p>
                <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-clay">
                  {s.label}
                </p>
              </div>
            ))}
          </section>

          <p className="mt-3 text-[12px] text-ink/55">
            Reminders last 14 days: {adherence.answered} answered of {adherence.sent} sent
            {adherence.sent
              ? ` (${Math.round((adherence.answered / adherence.sent) * 100)}%)`
              : ""}
            .
          </p>
          <p className="mt-1 text-[12px] text-ink/55">
            Today (patient's local day): {adherence.todaySent} sent ·{" "}
            {adherence.todayAnswered} answered ·{" "}
            {Math.max(0, adherence.todaySent - adherence.todayAnswered)} not answered.
          </p>


          <section className="mt-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">
              Last 14 days
            </p>
            <div className="mt-3 flex h-24 items-end gap-1.5">
              {days.map((d) => (
                <div key={d.date.toISOString()} className="flex-1">
                  <div
                    className="w-full rounded-t bg-clay/25"
                    style={{ height: `${(d.reports / maxDay) * 84}px` }}
                  >
                    <div
                      className="w-full rounded-t bg-brand"
                      style={{
                        height: `${d.reports ? (d.episodes / d.reports) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-ink/50">
              Filled portion = episodes as a share of that day's check-ins.
            </p>
          </section>

          <section className="mt-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">
              Behaviour mix
            </p>
            <div className="mt-3 space-y-2">
              {mix.map((b) => (
                <div key={b.id}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span>{b.label}</span>
                    <span className="text-clay">{b.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-sand">
                    <div
                      className={`h-1.5 rounded-full ${b.episode ? "bg-brand" : "bg-moss"}`}
                      style={{ width: `${Math.round(b.share * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">
              Time of day
            </p>
            <div className="mt-3 flex h-20 items-end gap-[3px]">
              {hours.map((count, h) => (
                <div
                  key={h}
                  className="flex-1 rounded-t bg-brand/70"
                  style={{ height: `${Math.max(2, (count / maxHour) * 72)}px` }}
                />
              ))}
            </div>
            <p className="mt-2 text-[12px] text-ink/50">
              {peak ? `Peak clustering ${peak.label} (${peak.count} episodes).` : "No episodes logged yet."}
            </p>
          </section>

          <section className="mt-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">
              Check-in log
            </p>
            <ul className="mt-3 space-y-2">
              {entries.slice(0, 40).map((e) => {
                const b = behaviorById(e.behavior);
                return (
                  <li key={e.id} className="rounded-2xl bg-sand/60 px-4 py-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[14px] font-semibold">{b.label}</span>
                      <span className="text-[11px] text-clay">
                        {new Date(e.ts).toLocaleDateString()} · {fmtTime(e.ts)}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-ink/55">
                      Tension {e.stress}/5
                      {e.contexts.length ? ` · ${e.contexts.join(", ")}` : ""}
                      {e.prompted ? "" : " · self-initiated"}
                    </p>
                  </li>
                );
              })}
              {!entries.length && (
                <li className="rounded-2xl bg-sand/60 px-4 py-5 text-[13px] text-ink/55">
                  This patient hasn't synced any check-ins yet.
                </li>
              )}
            </ul>
          </section>

          <button
            onClick={exportCsv}
            className="mt-6 h-12 w-full rounded-2xl border border-clay/40 text-[15px] font-semibold text-brand"
          >
            Export this record as CSV
          </button>
        </>
      )}
    </div>
  );
}
