import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { ensureAccount, type AppRole } from "@/lib/session";
import { syncNow } from "@/lib/sync";

export const PENDING_ROLE_KEY = "unclench.pendingRole";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Unclench jaw check-ins" },
      {
        name: "description",
        content:
          "Sign in to back up your awake bruxism check-ins and share them with your dentist, or open the clinician view of your patients.",
      },
      { property: "og:title", content: "Sign in — Unclench jaw check-ins" },
      {
        property: "og:description",
        content: "Optional account for cloud backup and clinician review of jaw check-ins.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  // What the person says they are. Self-service accounts can only ever *claim*
  // the patient role — clinician access is granted server-side after
  // verification, so picking "Clinician" only changes where we send them.
  const [intent, setIntent] = useState<AppRole>("patient");
  const role: AppRole = "patient";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const afterAuth = async (userRole: AppRole) => {
    await syncNow().catch(() => undefined);
    if (intent === "physician" && userRole !== "physician") {
      setMessage(
        "You're signed in, but clinician access isn't enabled on this account yet. Your clinic will enable it after verification.",
      );
      return;
    }
    navigate({ to: userRole === "physician" ? "/clinic" : "/", replace: true });
  };


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "signup") {
        window.localStorage.setItem(PENDING_ROLE_KEY, role);
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name, role },
          },
        });
        if (err) throw err;
        if (!data.session) {
          setMessage("Check your inbox to confirm the address, then sign in.");
          return;
        }
        const claimed = await ensureAccount(data.session.user, role, name);
        await afterAuth(claimed);
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (err) throw err;
        const claimed = await ensureAccount(data.user, role, name || undefined);
        await afterAuth(claimed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    window.localStorage.setItem(PENDING_ROLE_KEY, role);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError("Google sign-in failed. Try email instead.");
      return;
    }
    if (result.redirected) return;
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const claimed = await ensureAccount(data.user, role);
      await afterAuth(claimed);
    }
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 pt-8 pb-12 text-ink">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">
        Unclench · optional account
      </p>
      <h1 className="mt-1 font-display text-[26px] font-medium leading-tight">
        {mode === "signin" ? "Welcome back" : "Create an account"}
      </h1>
      <p className="mt-2 text-[13px] leading-snug text-ink/55">
        The app works without an account. Sign in to back up check-ins and let your clinician
        review them.
      </p>

      <p className="mt-4 rounded-2xl bg-sand/70 px-4 py-3 text-[12px] leading-snug text-ink/55">
        Are you a clinician? Sign in here and your clinic will enable doctor access on your
        account after verification.
      </p>



      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">I am a…</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["patient", "physician"] as AppRole[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setIntent(option);
                setMessage(null);
              }}
              className={`h-11 rounded-2xl border text-[14px] font-semibold transition ${
                intent === option
                  ? "border-brand bg-brand text-cream"
                  : "border-clay/30 bg-sand/40 text-ink/60"
              }`}
            >
              {option === "patient" ? "Patient" : "Clinician"}
            </button>
          ))}
        </div>
        {intent === "physician" && (
          <p className="mt-2 rounded-2xl bg-sand/70 px-4 py-3 text-[12px] leading-snug text-ink/55">
            Clinician access is enabled by your clinic after verification. Sign in here and the
            Clinic tab appears once it's approved.
          </p>
        )}
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3">
        {mode === "signup" && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="h-12 w-full rounded-2xl border border-clay/30 bg-sand/40 px-4 text-[15px] outline-none placeholder:text-ink/35 focus:border-brand"
          />
        )}

        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          className="h-12 w-full rounded-2xl border border-clay/30 bg-sand/40 px-4 text-[15px] outline-none placeholder:text-ink/35 focus:border-brand"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          className="h-12 w-full rounded-2xl border border-clay/30 bg-sand/40 px-4 text-[15px] outline-none placeholder:text-ink/35 focus:border-brand"
        />

        {error && <p className="text-[13px] text-brand">{error}</p>}
        {message && <p className="text-[13px] text-ink/60">{message}</p>}

        <button
          type="submit"
          disabled={busy}
          className="h-12 w-full rounded-2xl bg-brand text-[15px] font-semibold text-cream disabled:opacity-60"
        >
          {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        onClick={google}
        className="mt-3 h-12 w-full rounded-2xl border border-clay/40 text-[15px] font-semibold text-brand"
      >
        Continue with Google
      </button>

      <button
        type="button"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="mt-5 w-full text-[13px] text-ink/55"
      >
        {mode === "signin"
          ? "New here? Create an account"
          : "Already have an account? Sign in"}
      </button>

      <Link to="/" className="mt-6 block text-center text-[13px] font-semibold text-clay">
        Continue without an account
      </Link>
    </div>
  );
}
