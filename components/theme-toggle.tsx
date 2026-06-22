"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

// Hydration guard without effect-state: false on the server snapshot, true on
// the client — the resolved theme is only knowable after hydration.
const noopSubscribe = () => () => {};
const useMounted = () =>
  useSyncExternalStore(noopSubscribe, () => true, () => false);

/**
 * Top-bar theme toggle. Flips between light and dark (seeded from the resolved
 * system theme). Mounted-guard avoids a hydration mismatch since the resolved
 * theme is only known on the client.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label="Toggle colour theme"
      title={mounted ? `Switch to ${isDark ? "light" : "dark"} theme` : "Toggle theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-surface text-ink transition-colors hover:border-harbour"
    >
      {/* Icon shows the action: moon in light mode (→ go dark), sun in dark
          mode (→ go light). Neutral dot until mounted to avoid SSR mismatch. */}
      {!mounted ? (
        <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
        </svg>
      ) : isDark ? (
        // Sun
        <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41" />
        </svg>
      ) : (
        // Crescent moon
        <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="currentColor">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      )}
    </button>
  );
}
