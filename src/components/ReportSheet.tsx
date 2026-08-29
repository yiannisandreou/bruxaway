import { useState } from "react";

import { BEHAVIORS, CONTEXTS, type BehaviorId, useEntries } from "@/lib/ema";

export function ReportSheet({
  open,
  prompted,
  onClose,
}: {
  open: boolean;
  prompted: boolean;
  onClose: () => void;
}) {
  const { addEntry } = useEntries();
  const [behavior, setBehavior] = useState<BehaviorId | null>(null);
  const [contexts, setContexts] = useState<string[]>([]);
  const [stress, setStress] = useState(3);
  const [saved, setSaved] = useState(false);

  if (!open) return null;

  const reset = () => {
    setBehavior(null);
    setContexts([]);
    setStress(3);
    setSaved(false);
  };

  const toggleContext = (c: string) =>
    setContexts((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const submit = () => {
    if (!behavior) return;
    addEntry({ behavior, contexts, stress, prompted });
    setSaved(true);
    window.setTimeout(() => {
      reset();
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-cream px-5 pt-4 pb-8 shadow-brand">
        <div className="mx-auto h-1 w-10 rounded-full bg-clay/30" />

        {saved ? (
          <div className="py-16 text-center">
            <p className="font-display text-[28px] leading-tight text-brand">Logged.</p>
            <p className="mt-2 text-[13px] text-ink/70">
              Let the jaw hang loose, teeth apart, lips together.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-clay">
                  {prompted ? "Scheduled prompt" : "Self report"}
                </p>
                <h2 className="mt-1 font-display text-[24px] leading-tight">
                  What was your jaw doing just now?
                </h2>
              </div>
              <button
                onClick={() => {
                  reset();
                  onClose();
                }}
                className="mt-1 shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-clay"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {BEHAVIORS.map((b) => {
                const active = behavior === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => setBehavior(b.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all duration-200 ${
                      active
                        ? "scale-[1.01] bg-brand text-cream shadow-brand-sm"
                        : "border border-clay/25 bg-sand/50"
                    }`}
                  >
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-xl text-lg ${
                        active ? "bg-cream/15 text-amber" : "bg-cream text-clay"
                      }`}
                    >
                      {b.glyph}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold">{b.label}</span>
                      <span
                        className={`block text-[12px] ${active ? "text-cream/75" : "text-ink/55"}`}
                      >
                        {b.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-clay">
                What were you doing?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CONTEXTS.map((c) => {
                  const active = contexts.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => toggleContext(c)}
                      className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                        active
                          ? "bg-brand text-cream"
                          : "border border-clay/30 bg-sand/40 text-ink/70"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-clay">
                  Tension right now
                </p>
                <span className="text-[12px] font-semibold text-brand">{stress} / 5</span>
              </div>
              <div className="mt-2 flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    aria-label={`Tension ${n}`}
                    onClick={() => setStress(n)}
                    className={`h-2.5 flex-1 rounded-full transition-colors ${
                      n <= stress ? "bg-brand" : "bg-clay/25"
                    }`}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={submit}
              disabled={!behavior}
              className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[16px] font-semibold tracking-wide text-cream shadow-brand-sm disabled:bg-clay/30 disabled:text-ink/40 disabled:shadow-none"
            >
              <span className="size-2.5 rounded-full bg-amber" />
              Save report
            </button>
          </>
        )}
      </div>
    </div>
  );
}
