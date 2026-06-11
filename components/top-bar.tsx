"use client";

import { useWorkspace, COMPARE_LIMIT } from "@/lib/workspace";
import { ThemeToggle } from "./theme-toggle";
import { AuthButton } from "./auth-button";

/**
 * Thin top bar: product name · query-bar placeholder · Compare counter ·
 * theme toggle. Static placeholders only — the query bar and Compare flow are
 * wired in later milestones (M4/M5).
 */
export function TopBar() {
  const { compare, clearCompare } = useWorkspace();
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-hairline bg-surface px-4">
      {/* Product name */}
      <span className="font-display text-lg font-bold tracking-tight text-ink whitespace-nowrap">
        NZ Suburb Intelligence
      </span>

      {/* Query-bar placeholder (non-functional this session) */}
      <div className="mx-auto hidden w-full max-w-xl items-center sm:flex">
        <input
          type="text"
          disabled
          aria-label="Ask about a suburb (coming soon)"
          placeholder="Ask about a suburb…  e.g. “family-friendly, near good schools”"
          className="h-9 w-full cursor-not-allowed rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink placeholder:text-ink/40"
        />
      </div>

      {/* Compare counter (figures in mono); click clears the pinned set */}
      <button
        type="button"
        onClick={clearCompare}
        disabled={compare.length === 0}
        title={compare.length ? "Clear comparison" : "Pin suburbs with + Compare"}
        className="ml-auto whitespace-nowrap font-mono text-xs text-ink/70 disabled:cursor-default"
      >
        Compare <span className="text-harbour">{compare.length}</span>/{COMPARE_LIMIT}
        {compare.length > 0 && <span className="ml-1 text-ink/40">✕</span>}
      </button>

      <AuthButton />
      <ThemeToggle />
    </header>
  );
}
