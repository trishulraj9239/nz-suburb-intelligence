"use client";

import { setPersona, usePersona } from "@/lib/preferences";
import { PERSONAS } from "@/lib/persona";

/**
 * Top-bar persona switch (TRI-60) — segmented control rendered from the
 * PERSONAS registry, so a third persona appears with zero code change here.
 * Drives profile/Compare section order, the default map metric, and NL
 * emphasis. Persists like the other prefs (localStorage + shared event);
 * SSR/hydration renders the default persona, then the stored one applies.
 */
export function PersonaToggle() {
  const persona = usePersona();

  return (
    <div
      role="radiogroup"
      aria-label="I am"
      className="inline-flex h-8 shrink-0 items-center overflow-hidden rounded-md border border-hairline bg-surface"
    >
      {Object.values(PERSONAS).map((p) => {
        const active = p.key === persona;
        return (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPersona(p.key)}
            title={`Order the panels for ${p.label.toLowerCase()}`}
            className={`h-full px-2.5 text-xs font-medium transition-colors ${
              active
                ? "bg-harbour text-surface"
                : "bg-transparent text-ink/70 hover:text-ink"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
