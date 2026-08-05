"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { ThemeToggle } from "./theme-toggle";
import { AuthButton } from "./auth-button";
import { BudgetControl } from "./budget-control";
import { AnchorsControl } from "./anchors-control";
import { PersonaToggle } from "./persona-toggle";

/** Seeds the query bar so the box is never blank — also the state Home returns to. */
const DEFAULT_QUERY = "Cheapest rent near Takapuna?";

/**
 * Thin top bar: Home (full reset) · product name · query bar (clearable, seeded
 * with an example) · persona · workplace · budget · auth · theme.
 */
export function TopBar() {
  const { ask, reset } = useWorkspace();
  const [query, setQuery] = useState(DEFAULT_QUERY);

  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline bg-surface px-4 py-2">
      {/* Home — resets map, profile, comparison, and the query box */}
      <button
        type="button"
        onClick={() => {
          reset();
          setQuery(DEFAULT_QUERY);
        }}
        title="Home — reset everything"
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline bg-canvas px-2.5 py-1.5 text-sm font-medium text-ink transition-colors hover:border-harbour"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
        </svg>
        <span className="hidden sm:inline">Home</span>
      </button>

      {/* Product name (short mark on phones) */}
      <span className="font-display text-lg font-bold tracking-tight text-ink whitespace-nowrap">
        <span className="hidden sm:inline">NZ Suburb Intelligence</span>
        <span className="sm:hidden">NZSI</span>
      </span>

      {/* Query bar — clearable; wraps to its own row on phones. */}
      <form
        className="order-last flex w-full basis-full items-center sm:order-none sm:mx-auto sm:w-auto sm:max-w-xl sm:flex-1 sm:basis-auto"
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
            className="h-9 w-full rounded-lg border border-hairline bg-canvas pl-3 pr-9 text-sm text-ink placeholder:text-ink/40 focus:border-harbour focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear query"
              title="Clear"
              className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-ink/40 transition-colors hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
      </form>

      <div className="ml-auto flex shrink-0 items-center gap-x-3">
        <PersonaToggle />
        <AnchorsControl />
        <BudgetControl />
        <AuthButton />
        <ThemeToggle />
      </div>
    </header>
  );
}
