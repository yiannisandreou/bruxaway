import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { greeting, useSettings } from "@/lib/ema";
import { useSession } from "@/lib/session";

const TABS = [
  { to: "/", label: "Now" },
  { to: "/trends", label: "Trends" },
  { to: "/cues", label: "Cues" },
  { to: "/profile", label: "Profile" },
] as const;

const CLINIC_TAB = { to: "/clinic", label: "Clinic" } as const;


export function AppShell({
  title,
  eyebrow,
  children,
}: {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  const { settings } = useSettings();
  const g = greeting();
  const day = new Date().toLocaleDateString([], { weekday: "short", day: "numeric" });
  const name = settings.name.trim();
  const initial = (name || "U").charAt(0).toUpperCase();

  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-cream text-ink">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">
            {eyebrow ?? `${g.part} · ${day}`}
          </p>
          <h1 className="mt-0.5 font-display text-[22px] font-medium leading-tight">
            {title ?? (name ? `${g.hello}, ${name}` : g.hello)}
          </h1>
        </div>
        <Link
          to="/profile"
          aria-label="Profile"
          className="grid size-10 place-items-center rounded-full bg-sand font-display text-lg text-brand outline-1 -outline-offset-1 outline-clay/30"
        >
          {initial}
        </Link>
      </header>

      <main className="pb-28">{children}</main>

      <nav className="fixed bottom-0 left-1/2 w-full max-w-[430px] -translate-x-1/2 border-t border-clay/15 bg-cream/95 px-5 pt-3 pb-4 backdrop-blur">
        <div className="flex items-center justify-between">
          {TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              activeOptions={{ exact: tab.to === "/" }}
              className="flex flex-1 flex-col items-center text-clay/60"
              activeProps={{ className: "text-brand" }}
            >
              {({ isActive }) => (
                <>
                  <span className="text-[10px] font-semibold">{tab.label}</span>
                  <span
                    className={`mt-1 size-1.5 rounded-full ${
                      isActive ? "bg-brand" : "bg-clay/30"
                    }`}
                  />
                </>
              )}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
