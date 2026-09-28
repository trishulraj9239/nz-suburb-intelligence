"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { ThemeToggle } from "./theme-toggle";
import { AuthButton } from "./auth-button";
import { BudgetControl } from "./budget-control";
import { AnchorsControl } from "./anchors-control";
import { PersonaToggle } from "./persona-toggle";
import { YouMenu } from "./you-menu";

/** Seeds the query bar so the box is never blank — also the state Home returns to. */
const DEFAULT_QUERY = "Cheapest rent near Takapuna?";

/**
 * Top bar. One row at every width (TRI-145, Phase A): Home · product name ·
 * the ask box · then either the inline preference cluster (≥ lg) or the "You"
 * menu that folds persona / places / budget / sign-in / theme (< lg). The top
 * safe-area inset is honoured for notched phones.
 */
export function TopBar() {
  const { ask, reset } = useWorkspace();
  const [query, setQuery] = useState(DEFAULT_QUERY);

  return (
    <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-3 sm:px-4">
      {/* Home — resets map, profile, comparison, and the query box */}
      <button
        type="button"
        onClick={() => {
          reset();
          setQuery(DEFAULT_QUERY);
        }}
        title="Home — reset everything"
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-control border border-hairline bg-canvas px-2.5 text-body font-medium text-ink transition-colors hover:border-harbour"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
        </svg>
        <span className="hidden sm:inline">Home</span>
      </button>

      {/* Product name (short mark below lg) */}
      <span className="shrink-0 whitespace-nowrap font-display text-h3 font-bold tracking-tight text-ink">
        <span className="hidden lg:inline">NZ Suburb Intelligence</span>
        <span className="lg:hidden">NZSI</span>
      </span>

      {/* Query bar — clearable; takes the remaining width on every screen. */}
      <form
        className="flex min-w-0 flex-1 items-center lg:mx-auto lg:max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          const q = query.trim();
          if (q) ask(q);
        }}
      >
        <div className="relative w-full">
          <input
            type="text"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Ask about Auckland suburbs"
            placeholder="Ask about a suburb…  e.g. “cheapest rent near Takapuna?”"
            maxLength={500}
            className="h-10 w-full rounded-control border border-hairline bg-canvas pl-3 pr-10 text-body text-ink placeholder:text-ink/40 focus:border-harbour focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear query"
              title="Clear"
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink/40 transition-colors hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
      </form>

      {/* ≥ lg: inline preference cluster. < lg: the You menu. */}
      <div className="ml-auto hidden shrink-0 items-center gap-x-3 lg:flex">
        <PersonaToggle />
        <AnchorsControl />
        <BudgetControl />
        <AuthButton />
        <ThemeToggle />
      </div>
      <YouMenu />
    </header>
  );
}
