"use client";

import { useWorkspace } from "@/lib/workspace";
import { usePersona } from "@/lib/preferences";
import { followUpChips, starterChips } from "@/lib/question-chips";

/**
 * TRI-93 — suggested questions. Three placements, one component:
 *
 *  - `variant="starter"` sits over the map in browse mode on desktop, showing
 *    what this thing can be asked before anyone has typed anything. It
 *    disappears the moment a question exists — it's an empty state, not
 *    furniture. Desktop-only since TRI-145: on a phone it collided with the
 *    map controls, so…
 *  - `variant="starter-inline"` renders the same chips inside the sheet's
 *    empty state on phones (context-panel.tsx).
 *  - `variant="follow-up"` sits under an answer, phrased around a suburb that
 *    answer actually cited.
 *
 * Chips are persona-aware and come from the tested set (TRI-81), so every one
 * is a question the pipeline has been shown to handle.
 */
export function QuestionChips({ variant }: { variant: "starter" | "starter-inline" | "follow-up" }) {
  const { question, currentTurn, ask } = useWorkspace();
  const persona = usePersona();

  const isStarter = variant === "starter" || variant === "starter-inline";
  if (isStarter && question) return null;

  // Anchor follow-ups to the first suburb the answer cited.
  const citedSuburb = currentTurn?.sources[0]?.suburb ?? null;
  const chips = isStarter ? starterChips(persona) : followUpChips(persona, citedSuburb);
  if (!chips.length) return null;
  if (variant === "follow-up" && currentTurn?.status !== "done") return null;

  const wrap =
    variant === "starter"
      ? "pointer-events-none absolute bottom-3 left-3 z-10 hidden max-w-[min(24rem,calc(100%-6rem))] flex-col items-start gap-1.5 lg:flex"
      : variant === "starter-inline"
        ? "flex flex-col items-start gap-1.5"
        : "flex flex-wrap items-center gap-1.5";

  return (
    <div className={wrap}>
      <span className="font-display text-micro font-semibold uppercase tracking-wider text-ink/50">
        {isStarter ? "Try asking" : "Next"}
      </span>
      <div className={isStarter ? "flex flex-col items-start gap-1.5" : "contents"}>
        {chips.map((c) => (
          <button
            key={c.question}
            type="button"
            onClick={() => ask(c.question)}
            title={c.question}
            className="pointer-events-auto min-h-10 max-w-full truncate rounded-chip border border-hairline bg-surface px-3 text-left text-label text-ink shadow-card transition-colors hover:border-harbour hover:text-harbour"
          >
            {isStarter ? `“${c.question}”` : c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
