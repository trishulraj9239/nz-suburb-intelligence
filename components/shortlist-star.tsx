"use client";

import { isShortlisted, toggleShortlist, useShortlist } from "@/lib/shortlist";

/**
 * TRI-99 — the save toggle on a profile header. A pressed star means the
 * suburb is in the reader's private shortlist (localStorage); nothing leaves
 * the device. 40 px target, name in the accessible label, state in aria-pressed.
 */
export function ShortlistStar({ sa2, name }: { sa2: string; name: string }) {
  const list = useShortlist();
  const saved = isShortlisted(list, sa2);
  return (
    <button
      type="button"
      onClick={() => toggleShortlist(sa2, name)}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from your shortlist` : `Save ${name} to your shortlist`}
      title={saved ? "Saved — remove from your shortlist" : "Save to your shortlist (kept on this device only)"}
      data-testid="shortlist-star"
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control border transition-colors ${
        saved ? "border-harbour bg-harbour/10 text-harbour" : "border-hairline bg-surface text-ink/60 hover:border-harbour hover:text-ink"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
        <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z" />
      </svg>
    </button>
  );
}
