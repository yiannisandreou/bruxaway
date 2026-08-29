import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { syncNow } from "@/lib/sync";
import {
  behaviorById,
  streakDays,
  useEntries,
  useHydrated,
  useSettings,
} from "@/lib/ema";


export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile & Prompt Schedule — Unclench" },
      {
        name: "description",
        content:
          "Set how many jaw check-in prompts you get each day, your waking window, and export or clear your awake bruxism data.",
      },
      { property: "og:title", content: "Profile & Prompt Schedule — Unclench" },
      {
        property: "og:description",
        content: "Configure prompt frequency and waking hours, and export your check-in data.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const hydrated = useHydrated();
  const { settings, update } = useSettings();
  const { entries, clearAll } = useEntries();
  const [confirming, setConfirming] = useState(false);
  const { user, role, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const [syncState, setSyncState] = useState<string | null>(null);

  const doSync = async () => {
    setSyncState("Syncing…");
    try {
      const result = await syncNow();
      setSyncState(
        result.synced
          ? `Synced · ${result.pushed} uploaded, ${result.pulled} pulled`
          : "Sign in to sync",
      );
    } catch {
      setSyncState("Sync failed — try again");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };


  const episodes = entries.filter((e) => behaviorById(e.behavior).episode).length;

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
    a.download = "unclench-reports.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell title="Your setup" eyebrow="Profile · assessment settings">
      <section className="mx-5 grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Reports", value: entries.length },
          { label: "Episodes", value: episodes },
          { label: "Streak", value: `${streakDays(entries)}d` },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-sand/70 px-2 py-3">
            <p className="font-display text-[22px] leading-none text-brand">
              {hydrated ? s.value : "—"}
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-clay">
              {s.label}
            </p>
          </div>
        ))}
      </section>

      <section className="mx-5 mt-6 rounded-2xl bg-sand/60 px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">Account</p>
        {sessionLoading ? (
          <p className="mt-2 text-[13px] text-ink/45">Checking account…</p>
        ) : user ? (
          <>
            <p className="mt-2 text-[14px] font-semibold">{user.email}</p>
            <p className="mt-1 text-[12px] leading-snug text-ink/55">
              {role === "physician"
                ? "Clinician account — you can review assigned patients' records."
                : "Patient account — your check-ins back up to the cloud so your clinician can review them."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={doSync}
                className="h-10 rounded-xl bg-brand px-4 text-[13px] font-semibold text-cream"
              >
                Sync now
              </button>
              {role === "physician" && (
                <Link
                  to="/clinic"
                  className="flex h-10 items-center rounded-xl border border-clay/40 px-4 text-[13px] font-semibold text-brand"
                >
                  Open clinic
                </Link>
              )}
              <button
                onClick={signOut}
                className="h-10 rounded-xl border border-clay/40 px-4 text-[13px] font-semibold text-clay"
              >
                Sign out
              </button>
            </div>
            {syncState && <p className="mt-2 text-[12px] text-ink/50">{syncState}</p>}
          </>
        ) : (
          <>
            <p className="mt-2 text-[13px] leading-snug text-ink/55">
              Working offline on this device. Create an account to back up your check-ins and let
              your clinician follow your progress.
            </p>
            <Link
              to="/auth"
              className="mt-3 flex h-11 items-center justify-center rounded-xl bg-brand text-[14px] font-semibold text-cream"
            >
              Sign in or create account
            </Link>
          </>
        )}
      </section>


      <section className="mx-5 mt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">Your name</p>
        <input
          value={settings.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="How should we greet you?"
          className="mt-2 h-12 w-full rounded-2xl border border-clay/30 bg-sand/40 px-4 text-[15px] outline-none placeholder:text-ink/35 focus:border-brand"
        />
      </section>

      <section className="mx-5 mt-6">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">
            Prompts per day
          </p>
          <span className="text-[13px] font-semibold text-brand">{settings.promptsPerDay}</span>
        </div>
        <input
          type="range"
          min={3}
          max={12}
          value={settings.promptsPerDay}
          onChange={(e) => update({ promptsPerDay: Number(e.target.value) })}
          className="mt-3 w-full accent-[var(--brand)]"
        />
        <p className="mt-1 text-[12px] text-ink/50">
          Classic EMA protocols use random prompts across the waking day.
        </p>
      </section>

      <section className="mx-5 mt-6 grid grid-cols-2 gap-3">
        <label className="rounded-2xl bg-sand/70 px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-clay">
            Wake hour
          </span>
          <input
            type="number"
            min={0}
            max={23}
            value={settings.startHour}
            onChange={(e) =>
              update({ startHour: Math.min(23, Math.max(0, Number(e.target.value))) })
            }
            className="mt-1 w-full bg-transparent font-display text-[24px] leading-none text-brand outline-none"
          />
        </label>
        <label className="rounded-2xl bg-sand/70 px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-clay">
            Sleep hour
          </span>
          <input
            type="number"
            min={1}
            max={24}
            value={settings.endHour}
            onChange={(e) =>
              update({ endHour: Math.min(24, Math.max(1, Number(e.target.value))) })
            }
            className="mt-1 w-full bg-transparent font-display text-[24px] leading-none text-brand outline-none"
          />
        </label>
      </section>

      <section className="mx-5 mt-6 space-y-3">
        <button
          onClick={exportCsv}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-clay/40 text-[15px] font-semibold text-brand"
        >
          <span className="size-2 rounded-full bg-clay" />
          Export reports as CSV
        </button>
        <button
          onClick={() => {
            if (confirming) {
              clearAll();
              setConfirming(false);
            } else setConfirming(true);
          }}
          className="h-12 w-full rounded-2xl bg-sand/60 text-[15px] font-semibold text-ink/60"
        >
          {confirming ? "Tap again to erase everything" : "Clear all data"}
        </button>
      </section>

      <p className="mx-5 mt-6 text-[12px] leading-snug text-ink/45">
        Reports are stored on this device and, when you're signed in, backed up to your account so an assigned clinician can review them. Unclench supports self-monitoring of awake
        bruxism and is not a diagnosis — share your export with your dentist or specialist.
      </p>
    </AppShell>
  );
}
