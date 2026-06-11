import { ThemeToggle } from "./theme-toggle";

/**
 * Thin top bar: product name · query-bar placeholder · Compare counter ·
 * theme toggle. Static placeholders only — the query bar and Compare flow are
 * wired in later milestones (M4/M5).
 */
export function TopBar() {
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

      {/* Compare counter (figures in mono) */}
      <span className="ml-auto whitespace-nowrap font-mono text-xs text-ink/70">
        Compare <span className="text-harbour">0</span>/3
      </span>

      <ThemeToggle />
    </header>
  );
}
