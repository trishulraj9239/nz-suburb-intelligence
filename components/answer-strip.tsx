"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { useIsLg } from "@/lib/use-is-lg";
import { AnswerThread } from "./answer-thread";

/**
 * TRI-83 — the DESKTOP answer frame: a full-width band between the top bar and
 * the map/panel row, present only once a question has been asked (browse mode
 * keeps the full-bleed map).
 *
 * A frame and nothing more: placement, collapse/close, and the max-height
 * NUMBER. All answer behaviour lives in <AnswerThread /> so the mobile sheet
 * tab (TRI-84) behaves identically. Mounted only at lg — see useIsLg in
 * page.tsx; never co-mounted with the mobile frame.
 */
export function AnswerStrip() {
  const { question, clearAsk } = useWorkspace();
  const isLg = useIsLg();
  const [collapsed, setCollapsed] = useState(false);

  // Below lg the answer belongs to the sheet tab (TRI-84) — returning null here
  // is what guarantees exactly one frame is mounted.
  if (!isLg || !question) return null;

  return (
    <section
      aria-label="Answer"
      className="shrink-0 border-b border-hairline bg-surface px-4 py-2"
    >
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[10px] font-semibold uppercase tracking-wider text-ink/45">
          Answer
        </span>
        <p className="min-w-0 flex-1 truncate text-xs italic text-ink/50">“{question}”</p>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand answer" : "Collapse answer"}
          className="shrink-0 px-1 text-xs text-ink/40 transition-colors hover:text-ink"
        >
          {collapsed ? "▾" : "▴"}
        </button>
        <button
          type="button"
          onClick={clearAsk}
          aria-label="Dismiss answer"
          className="shrink-0 px-1 text-xs text-ink/40 transition-colors hover:text-ink"
        >
          ✕
        </button>
      </div>

      {!collapsed && (
        <div className="mt-1.5">
          {/* The cap keeps the map usable on short laptop screens; the
              scroll/auto-follow mechanism itself lives in AnswerThread. */}
          <AnswerThread maxHeight="min(46vh, 480px)" />
        </div>
      )}
    </section>
  );
}
