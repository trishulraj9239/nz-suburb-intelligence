"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * Top-bar theme toggle. Flips between light and dark (seeded from the resolved
 * system theme). Mounted-guard avoids a hydration mismatch since the resolved
 * theme is only known on the client.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label="Toggle colour theme"
      title={mounted ? `Switch to ${isDark ? "light" : "dark"} theme` : "Toggle theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-surface text-ink transition-colors hover:border-harbour"
    >
      {/* Render a stable glyph until mounted to avoid SSR/client mismatch. */}
      <span aria-hidden className="text-sm leading-none">
        {mounted ? (isDark ? "☀" : "☾") : "◐"}
      </span>
    </button>
  );
}
