import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

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
  syncSettingsToCloud,
} from "@/lib/ema";
import {
  enableNotifications,
  disableNotifications,
  pushSupported,
  sendTestReminder,
} from "@/lib/push";


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
  const [notifMsg, setNotifMsg] = useState<string | null>(null);
  const [clinicianRequest, setClinicianRequest] = useState<
    "pending" | "approved" | "rejected" | null
  >(null);

  useEffect(() => {
    if (!user || role === "physician") {
      setClinicianRequest(null);
      return;
    }
    let alive = true;
    void supabase
      .from("role_requests")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setClinicianRequest((data?.status as typeof clinicianRequest) ?? null);
      });
    return () => {
      alive = false;
    };
  }, [user, role]);

  const canPush = pushSupported();

  const testReminder = async () => {
    setNotifMsg("Sending a test reminder…");
    const res = await sendTestReminder();
    setNotifMsg(
      res.ok
        ? "Sent — it should arrive within a few seconds, even with the app closed."
        : (res.reason ?? "Couldn't send the test reminder."),
    );
  };

  const toggleNotifications = async () => {
    if (settings.notifications) {
      await disableNotifications();
      update({ notifications: false });
      setNotifMsg("Reminders off.");
      return;
    }
    setNotifMsg("Enabling…");
    const res = await enableNotifications();
    if (res.ok) {
      update({ notifications: true });
      void syncSettingsToCloud();
      setNotifMsg("On — random prompts will arrive during your waking hours.");
    } else {
      setNotifMsg(res.reason ?? "Couldn't enable reminders.");
    }
  };

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
            {role !== "physician" && clinicianRequest === "pending" && (
              <p className="mt-2 rounded-xl bg-cream px-3 py-2 text-[12px] leading-snug text-ink/60">
                Clinician access pending approval. Once an existing clinician approves your
                request, the Clinic tab appears automatically.
              </p>
            )}
            {role !== "physician" && clinicianRequest === "rejected" && (
              <p className="mt-2 rounded-xl bg-cream px-3 py-2 text-[12px] leading-snug text-ink/60">
                Your clinician access request wasn't approved. Contact your clinic if you think
                this is a mistake.
              </p>
            )}
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
          onChange={(e) => {
            update({ promptsPerDay: Number(e.target.value) });
            void syncSettingsToCloud();
          }}
          className="mt-3 w-full accent-[var(--brand)]"
        />
        <p className="mt-1 text-[12px] text-ink/50">
          Classic EMA protocols use random prompts across the waking day.
        </p>
      </section>

      <section className="mx-5 mt-6 rounded-2xl bg-sand/60 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">
              Reminders
            </p>
            <p className="mt-1 text-[13px] leading-snug text-ink/65">
              {!canPush
                ? "Push reminders need a mobile browser that supports them — install Unclench to your home screen on iOS."
                : user
                  ? "Random check-in prompts pushed to this device during your waking hours."
                  : "Random check-in prompts pushed to this device — no account needed."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.notifications}
            disabled={!hydrated || !canPush}
            onClick={toggleNotifications}

            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
              settings.notifications ? "bg-brand" : "bg-clay/30"
            }`}
          >
            <span
              className={`absolute top-0.5 size-6 rounded-full bg-cream transition-all ${
                settings.notifications ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
        {settings.notifications && canPush && (
          <>
            <button
              type="button"
              onClick={testReminder}
              className="mt-3 rounded-full border border-clay/40 px-3 py-1.5 text-[12px] font-medium text-ink/70 transition-colors hover:bg-cream"
            >
              Send a test reminder
            </button>
            <p className="mt-2 text-[11px] leading-snug text-ink/45">
              {isIos()
                ? "Nothing arriving? Check iPhone Settings → Notifications → Unclench are allowed, and keep Low Power Mode off."
                : "Nothing arriving while Unclench is fully closed? Set Android Settings → Apps → Unclench → Battery to “Unrestricted”."}
            </p>
          </>
        )}
        {notifMsg && <p className="mt-2 text-[12px] text-ink/50">{notifMsg}</p>}
      </section>

      <section className="mx-5 mt-6 grid grid-cols-2 gap-3">
        <HourWheel
          label="Wake hour"
          min={0}
          max={23}
          value={settings.startHour}
          onCommit={(h) => {
            update({ startHour: h });
            void syncSettingsToCloud();
          }}
        />
        <HourWheel
          label="Sleep hour"
          min={1}
          max={24}
          value={settings.endHour}
          onCommit={(h) => {
            update({ endHour: h });
            void syncSettingsToCloud();
          }}
        />
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

const WHEEL_ITEM_H = 40;
const WHEEL_VISIBLE = 5; // odd number — middle row is the selected one

function HourWheel({
  label,
  min,
  max,
  value,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onCommit: (hour: number) => void;
}) {
  const hours = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const listRef = useRef<HTMLUListElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const pad = (WHEEL_VISIBLE - 1) / 2; // spacer rows above and below

  // Position the wheel on the current value: instantly on mount (so the
  // opening animation can't commit phantom hours), smoothly after that.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const target = (value - min) * WHEEL_ITEM_H;
    if (!mounted.current) {
      mounted.current = true;
      el.scrollTop = target;
      return;
    }
    if (Math.abs(el.scrollTop - target) > WHEEL_ITEM_H / 2) {
      el.scrollTo({ top: target, behavior: "smooth" });
    }
  }, [value, min]);

  useEffect(
    () => () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    },
    [],
  );

  const handleScroll = () => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const el = listRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / WHEEL_ITEM_H);
      const hour = hours[Math.min(hours.length - 1, Math.max(0, idx))];
      if (hour !== undefined && hour !== value) onCommit(hour);
    }, 140);
  };

  return (
    <div className="rounded-2xl bg-sand/70 px-4 py-3">
      <p className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-clay">
        {label}
      </p>
      <div
        className="relative mt-2"
        style={{ height: WHEEL_ITEM_H * WHEEL_VISIBLE }}
      >
        {/* selection band */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-2 rounded-xl border border-brand/25 bg-brand/10"
          style={{ top: WHEEL_ITEM_H * pad, height: WHEEL_ITEM_H }}
        />
        {/* soft fade masks */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-sand via-sand/60 to-transparent"
          style={{ height: WHEEL_ITEM_H * pad }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-sand via-sand/60 to-transparent"
          style={{ height: WHEEL_ITEM_H * pad }}
        />
        <ul
          ref={listRef}
          onScroll={handleScroll}
          className="absolute inset-0 snap-y snap-mandatory overflow-y-scroll [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${label}-${value}`}
        >
          {Array.from({ length: pad }, (_, i) => (
            <li key={`pad-top-${i}`} style={{ height: WHEEL_ITEM_H }} aria-hidden />
          ))}
          {hours.map((h) => {
            const selected = h === value;
            return (
              <li
                key={h}
                id={`${label}-${h}`}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  listRef.current?.scrollTo({
                    top: (h - min) * WHEEL_ITEM_H,
                    behavior: "smooth",
                  });
                  if (!selected) onCommit(h);
                }}
                className={`flex snap-center items-center justify-center font-display leading-none transition-colors ${
                  selected ? "text-[22px] font-semibold text-brand" : "text-[16px] text-ink/35"
                }`}
                style={{ height: WHEEL_ITEM_H }}
              >
                {String(h % 24).padStart(2, "0")}:00
              </li>
            );
          })}
          {Array.from({ length: pad }, (_, i) => (
            <li key={`pad-bot-${i}`} style={{ height: WHEEL_ITEM_H }} aria-hidden />
          ))}
        </ul>
      </div>
    </div>
  );
}
