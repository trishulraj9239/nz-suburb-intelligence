"use client";

import { COMPARE_LIMIT, useWorkspace } from "@/lib/workspace";
import { clearShortlist, removeFromShortlist, useShortlist } from "@/lib/shortlist";

/**
 * TRI-99 — the saved suburbs as a strip of chips: tap one to open it, ✕ to
 * drop it, "Compare these" to feed the first COMPARE_LIMIT into the compare
 * set (setCompareSet). Renders nothing until something is saved, so the
 * empty state stays quiet for a first-time reader. Local-only; no account.
 */
export function ShortlistStrip({ compact = false }: { compact?: boolean }) {
  const list = useShortlist();
  const { select, setCompareSet } = useWorkspace();
  if (!list.length) return null;
  const compareable = list.slice(0, COMPARE_LIMIT);
  return (
    <section aria-label="Your shortlist" data-testid="shortlist-strip">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-micro font-semibold uppercase tracking-wider text-ink/55">
          Saved <span className="font-mono font-normal normal-case tracking-normal text-ink/45">{list.length} · on this device</span>
        </p>
        <button type="button" onClick={clearShortlist} className="min-h-8 text-micro text-ink/55 underline decoration-dotted underline-offset-2 hover:text-ink">
          Clear
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {list.map((s) => (
          <li key={s.sa2} className="inline-flex min-h-10 items-center overflow-hidden rounded-chip border border-hairline bg-surface" data-testid="shortlist-chip">
            <button type="button" onClick={() => select(s.sa2)} className="min-h-10 px-3 text-label text-ink transition-colors hover:text-harbour">
              {s.name}
            </button>
            <button
              type="button"
              onClick={() => removeFromShortlist(s.sa2)}
              aria-label={`Remove ${s.name} from your shortlist`}
              className="flex h-10 w-8 items-center justify-center border-l border-hairline font-mono text-micro text-ink/45 hover:bg-hairline/60 hover:text-ink"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {list.length >= 2 && (
        <button
          type="button"
          onClick={() => setCompareSet(compareable.map((s) => s.sa2))}
          data-testid="shortlist-compare"
          className={`mt-2 inline-flex min-h-10 items-center rounded-control border border-harbour bg-harbour/10 px-3 text-label font-medium text-ink hover:bg-harbour/20 ${compact ? "w-full justify-center" : ""}`}
        >
          Compare these{list.length > COMPARE_LIMIT ? ` (first ${COMPARE_LIMIT})` : ""}
        </button>
      )}
    </section>
  );
}
