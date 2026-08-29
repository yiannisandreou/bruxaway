import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { linkPatientByEmail } from "@/lib/care.functions";
import {
  approveClinician,
  rejectClinician,
} from "@/lib/clinician.functions";
import { behaviorById, sameDay, startOfDay } from "@/lib/ema";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/clinic/")({
  head: () => ({
    meta: [
      { title: "Clinician caseload — Unclench" },
      {
        name: "description",
        content:
          "Clinician view of assigned patients: check-in volume, awake bruxism episode rate and last activity at a glance.",
      },
      { property: "og:title", content: "Clinician caseload — Unclench" },
      {
        property: "og:description",
        content: "Assigned patients with check-in volume and episode rate.",
      },
    ],
  }),
  component: ClinicPage,
});

type PatientCard = {
  id: string;
  name: string | null;
  email: string | null;
  reports: number;
  episodes: number;
  today: number;
  lastTs: number | null;
};

type ClinicianRequest = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
};

function ClinicPage() {
  const { user, role, loading } = useSession();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<PatientCard[]>([]);
  const [fetching, setFetching] = useState(true);
  const [requests, setRequests] = useState<ClinicianRequest[]>([]);
  const [reqBusy, setReqBusy] = useState<string | null>(null);
  const [reqError, setReqError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFetching(true);
    const { data: links } = await supabase.from("care_links").select("patient_id");
    const ids = (links ?? []).map((l) => l.patient_id);
    if (!ids.length) {
      setPatients([]);
      setFetching(false);
      return;
    }
    const [{ data: profiles }, { data: entries }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").in("id", ids),
      supabase.from("entries").select("user_id, ts, behavior").in("user_id", ids),
    ]);
    const today = startOfDay(new Date()).getTime();
    setPatients(
      ids.map((id) => {
        const profile = (profiles ?? []).find((p) => p.id === id);
        const rows = (entries ?? []).filter((e) => e.user_id === id);
        const stamps = rows.map((r) => new Date(r.ts).getTime());
        return {
          id,
          name: profile?.full_name ?? null,
          email: profile?.email ?? null,
          reports: rows.length,
          episodes: rows.filter((r) => behaviorById(r.behavior as never).episode).length,
          today: stamps.filter((t) => sameDay(t, today)).length,
          lastTs: stamps.length ? Math.max(...stamps) : null,
        };
      }),
    );
    setFetching(false);
  }, []);

  const loadRequests = useCallback(async () => {
    const { data } = await supabase
      .from("role_requests")
      .select("id, email, full_name, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setRequests((data ?? []) as ClinicianRequest[]);
  }, []);

  useEffect(() => {
    if (!loading && user) {
      void load();
      void loadRequests();
    }
  }, [loading, user, load, loadRequests]);

  const decide = async (requestId: string, approve: boolean) => {
    setReqBusy(requestId);
    setReqError(null);
    const fn = approve ? approveClinician : rejectClinician;
    const result = await fn({ data: { requestId } });
    setReqBusy(null);
    if (!result.ok) {
      setReqError(result.error);
      return;
    }
    await loadRequests();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await linkPatientByEmail({ data: { email } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEmail("");
    await load();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (!loading && role !== "physician") {
    return (
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 pt-10 text-ink">
        <h1 className="font-display text-[24px] font-medium">Clinician access pending</h1>
        <p className="mt-2 text-[13px] text-ink/55">
          This account is registered as a patient. If you requested clinician access, an existing
          clinician still needs to approve it — the Clinic tab appears here once it's approved.
        </p>
        <Link to="/" className="mt-6 block text-[13px] font-semibold text-brand">
          Back to my check-ins
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 pt-6 pb-16 text-ink">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">
        Clinician view · read-only
      </p>
      <h1 className="mt-1 font-display text-[26px] font-medium leading-tight">Your caseload</h1>
      <p className="mt-2 text-[13px] leading-snug text-ink/55">
        {patients.length} assigned {patients.length === 1 ? "patient" : "patients"}. You can review
        logs, not edit them.
      </p>

      <form onSubmit={add} className="mt-5 flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Patient account email"
          className="h-12 flex-1 rounded-2xl border border-clay/30 bg-sand/40 px-4 text-[14px] outline-none placeholder:text-ink/35 focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy}
          className="h-12 rounded-2xl bg-brand px-4 text-[14px] font-semibold text-cream disabled:opacity-60"
        >
          {busy ? "…" : "Assign"}
        </button>
      </form>
      {error && <p className="mt-2 text-[13px] text-brand">{error}</p>}

      {requests.length > 0 && (
        <section className="mt-6 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
            Clinician access requests
          </p>
          {reqError && <p className="text-[13px] text-brand">{reqError}</p>}
          {requests.map((r) => (
            <div key={r.id} className="rounded-2xl bg-sand/60 px-4 py-4">
              <div className="flex items-baseline justify-between">
                <p className="font-display text-[16px] leading-none">
                  {r.full_name || r.email || "Unknown"}
                </p>
                <span className="text-[11px] text-clay">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              {r.email && r.email !== r.full_name && (
                <p className="mt-1 text-[12px] text-ink/50">{r.email}</p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={reqBusy === r.id}
                  onClick={() => decide(r.id, true)}
                  className="h-9 flex-1 rounded-xl bg-brand text-[13px] font-semibold text-cream disabled:opacity-60"
                >
                  {reqBusy === r.id ? "…" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={reqBusy === r.id}
                  onClick={() => decide(r.id, false)}
                  className="h-9 flex-1 rounded-xl border border-clay/30 text-[13px] font-semibold text-clay disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="mt-6 space-y-3">
        {fetching && <p className="text-[13px] text-ink/45">Loading caseload…</p>}
        {!fetching && !patients.length && (
          <p className="rounded-2xl bg-sand/60 px-4 py-5 text-[13px] leading-snug text-ink/55">
            No patients yet. Assign one by their Unclench account email above.
          </p>
        )}
        {patients.map((p) => (
          <Link
            key={p.id}
            to="/clinic/$patientId"
            params={{ patientId: p.id }}
            className="block rounded-2xl bg-sand/60 px-4 py-4"
          >
            <div className="flex items-baseline justify-between">
              <p className="font-display text-[18px] leading-none">
                {p.name || p.email || "Patient"}
              </p>
              <span className="text-[11px] text-clay">
                {p.lastTs ? new Date(p.lastTs).toLocaleDateString() : "no data"}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Reports", value: p.reports },
                { label: "Episodes", value: p.episodes },
                { label: "Today", value: p.today },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-cream/70 py-2">
                  <p className="font-display text-[18px] leading-none text-brand">{s.value}</p>
                  <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-clay">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </Link>
        ))}
      </section>

      <button onClick={signOut} className="mt-8 text-[13px] font-semibold text-clay">
        Sign out
      </button>
    </div>
  );
}
