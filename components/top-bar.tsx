"use client";

import { useWorkspace, COMPARE_LIMIT } from "@/lib/workspace";
import { ThemeToggle } from "./theme-toggle";
import { AuthButton } from "./auth-button";
import { BudgetControl } from "./budget-control";

/**
 * Thin top bar: product name · query-bar placeholder · Compare counter ·
 * theme toggle. Static placeholders only — the query bar and Compare flow are
 * wired in later milestones (M4/M5).
 */
export function TopBar() {
  const { compare, clearCompare, ask } = useWorkspace();
  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline bg-surface px-4 py-2">
      {/* Product name (short mark on phones) */}
      <span className="font-display text-lg font-bold tracking-tight text-ink whitespace-nowrap">
        <span className="hidden sm:inline">NZ Suburb Intelligence</span>
        <span className="sm:hidden">NZSI</span>
      </span>

      {/* Query bar — live as of M5 (TRI-28); wraps to its own row on phones. */}
      <form
        className="order-last flex w-full basis-full items-center sm:order-none sm:mx-auto sm:w-auto sm:max-w-xl sm:flex-1 sm:basis-auto"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem("q") as HTMLInputElement;
          const q = input.value.trim();
          if (q) ask(q);
        }}
      >
        <input
          type="text"
          name="q"
          aria-label="Ask about Auckland suburbs"
          placeholder="Ask about a suburb…  e.g. “cheapest rent near Takapuna?”"
          maxLength={500}
          className="h-9 w-full rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink placeholder:text-ink/40 focus:border-harbour focus:outline-none"
        />
      </form>

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

      <BudgetControl />
      <AuthButton />
      <ThemeToggle />
    </header>
  );
}
