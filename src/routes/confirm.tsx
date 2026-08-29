import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

type EmailOtpType = "signup" | "recovery" | "invite" | "email_change" | "magiclink" | "email";

export const Route = createFileRoute("/confirm")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Confirming your email — Unclench" },
      {
        name: "description",
        content: "Finishing email confirmation for your Unclench jaw check-in account.",
      },
      { property: "og:title", content: "Confirming your email — Unclench" },
      {
        property: "og:description",
        content: "Finishing email confirmation for your Unclench account.",
      },
    ],
  }),
  component: ConfirmPage,
});

function ConfirmPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "done" | "failed">("working");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [resent, setResent] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    void (async () => {
      const url = new URL(window.location.href);
      const tokenHash = url.searchParams.get("token_hash") ?? url.searchParams.get("token");
      const type = (url.searchParams.get("type") ?? "signup") as EmailOtpType;
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const errDescription = url.searchParams.get("error_description") ?? hash.get("error_description");

      try {
        if (accessToken && refreshToken) {
          const { error: err } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (err) throw err;
        } else if (tokenHash) {
          const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (err) {
            // The link may already have been consumed (email prefetch); if a
            // session exists anyway, treat that as success.
            const { data } = await supabase.auth.getUser();
            if (!data.user) throw err;
          }
        } else {
          const { data } = await supabase.auth.getUser();
          if (!data.user) throw new Error(errDescription ?? "This confirmation link is incomplete.");
        }

        setStatus("done");
        window.setTimeout(() => navigate({ to: "/", replace: true }), 1200);
      } catch (err) {
        setStatus("failed");
        setError(err instanceof Error ? err.message : "This link is invalid or has expired.");
      }
    })();
  }, [navigate]);

  const resend = async () => {
    setResent(null);
    setCooldown(60);
    const { error: err } = await supabase.auth.resend({ type: "signup", email });
    setResent(
      err
        ? err.message
        : "Confirmation email sent. Open the newest one — older links stop working.",
    );
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-cream px-5 pt-10 pb-12 text-ink">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">
        Unclench · email confirmation
      </p>

      {status === "working" && (
        <>
          <h1 className="mt-1 font-display text-[26px] font-medium leading-tight">
            Confirming your email…
          </h1>
          <p className="mt-2 text-[13px] leading-snug text-ink/55">One moment.</p>
        </>
      )}

      {status === "done" && (
        <>
          <h1 className="mt-1 font-display text-[26px] font-medium leading-tight">
            You're all set
          </h1>
          <p className="mt-2 text-[13px] leading-snug text-ink/55">
            Your email is confirmed. Taking you to your check-ins…
          </p>
          <Link
            to="/"
            className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-brand text-[15px] font-semibold text-cream"
          >
            Continue
          </Link>
        </>
      )}

      {status === "failed" && (
        <>
          <h1 className="mt-1 font-display text-[26px] font-medium leading-tight">
            This link didn't work
          </h1>
          <p className="mt-2 text-[13px] leading-snug text-ink/55">
            {error} Confirmation links can only be opened once. Send a fresh one below.
          </p>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email"
            autoComplete="email"
            className="mt-4 h-12 w-full rounded-2xl border border-clay/30 bg-sand/40 px-4 text-[15px] outline-none placeholder:text-ink/35 focus:border-brand"
          />
          <button
            type="button"
            onClick={resend}
            disabled={!email || cooldown > 0}
            className="mt-3 h-12 w-full rounded-2xl bg-brand text-[15px] font-semibold text-cream disabled:opacity-60"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend confirmation email"}
          </button>
          {resent && <p className="mt-3 text-[13px] text-ink/60">{resent}</p>}

          <Link to="/auth" className="mt-6 block text-center text-[13px] font-semibold text-clay">
            Back to sign in
          </Link>
        </>
      )}
    </div>
  );
}
