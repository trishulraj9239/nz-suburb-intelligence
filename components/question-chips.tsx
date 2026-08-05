"use client";

import { useWorkspace } from "@/lib/workspace";
import { usePersona } from "@/lib/preferences";
import { followUpChips, starterChips } from "@/lib/question-chips";

/**
 * TRI-93 — suggested questions. Two placements, one component:
 *
 *  - `variant="starter"` sits over the map in browse mode, showing what this
 *    thing can be asked before anyone has typed anything. It disappears the
 *    moment a question exists — it's an empty state, not furniture.
 *  - `variant="follow-up"` sits under an answer, phrased around a suburb that
 *    answer actually cited.
 *
 * Chips are persona-aware and come from the tested set (TRI-81), so every one
 * is a question the pipeline has been shown to handle.
 */
export function QuestionChips({ variant }: { variant: "starter" | "follow-up" }) {
  const { question, currentTurn, ask } = useWorkspace();
  const persona = usePersona();

  if (variant === "starter" && question) return null;

  // Anchor follow-ups to the first suburb the answer cited.
  const citedSuburb = currentTurn?.sources[0]?.suburb ?? null;
  const chips =
    variant === "starter" ? starterChips(persona) : followUpChips(persona, citedSuburb);
  if (!chips.length) return null;
  if (variant === "follow-up" && currentTurn?.status !== "done") return null;

  return (
    <div
      className={
        variant === "starter"
          ? "pointer-events-none absolute left-14 top-2 z-10 flex max-w-[min(22rem,calc(100%-4.5rem))] flex-col items-start gap-1.5"
          : "flex flex-wrap items-center gap-1.5"
      }
    >
      <span className="font-display text-[10px] font-semibold uppercase tracking-wider text-ink/45">
        {variant === "starter" ? "Try asking" : "Next"}
      </span>
      <div className={variant === "starter" ? "flex flex-col items-start gap-1.5" : "contents"}>
        {chips.map((c) => (
          <button
            key={c.question}
            type="button"
            onClick={() => ask(c.question)}
            title={c.question}
            className="pointer-events-auto max-w-full truncate rounded-full border border-hairline bg-surface px-3 py-1 text-left text-xs text-ink shadow-sm transition-colors hover:border-harbour hover:text-harbour"
          >
            {variant === "starter" ? `“${c.question}”` : c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
