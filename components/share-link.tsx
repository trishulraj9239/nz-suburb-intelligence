"use client";

import { useState } from "react";

/**
 * TRI-97 — copy a link to this view. The URL already carries the suburb, the
 * compare set and the question (lib/url-state.ts) and nothing personal, so
 * the link is safe to paste anywhere. The button never reads preferences.
 */
export function ShareLink({ className = "" }: { className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1800);
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy a link to this view"
      title="Copy a link to this view — it carries the suburb, comparison and question, never your settings"
      data-testid="share-link"
      aria-live="polite"
      className={`inline-flex h-10 items-center gap-1.5 rounded-control border border-hairline bg-surface px-3 text-label font-medium text-ink hover:border-harbour ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" />
      </svg>
      {state === "copied" ? "Link copied" : state === "failed" ? "Copy failed" : "Share"}
    </button>
  );
}
