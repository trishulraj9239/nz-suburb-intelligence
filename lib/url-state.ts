/**
 * TRI-97 — the shareable part of the workspace, in the URL.
 *
 *   ?sa2=130400                       the suburb open in the profile
 *   &compare=130400,126801,166000     the compare set (≤ COMPARE_LIMIT)
 *   &q=Cheapest%20rent%20near%20Takapuna%3F   the current question
 *
 * PRIVACY RULE: preferences — persona, rent budget, saved places / workplace —
 * NEVER go in the URL. They are the reader's, not the view's. Address pins are
 * also kept out for now: a pasted link that carries someone's shortlisted home
 * addresses is a leak, not a share (TRI-153 will revisit with an explicit
 * opt-in when share cards land).
 *
 * The URL is written with history.replaceState during interaction (no
 * navigation, no re-render, no history spam) and read once on load; restoring
 * a `q` re-runs the question exactly once through the workspace's single ask
 * path, so the M16 invariant (one /api/ask caller) holds.
 */

export interface UrlState {
  sa2: string | null;
  compare: string[];
  q: string | null;
}

const SA2 = /^\d{6}$/;
const MAX_Q = 300;
const MAX_COMPARE = 3;

export const EMPTY_URL_STATE: UrlState = { sa2: null, compare: [], q: null };

export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search);
  const sa2 = p.get("sa2");
  const compare = (p.get("compare") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => SA2.test(s));
  const q = (p.get("q") ?? "").trim().slice(0, MAX_Q);
  return {
    sa2: sa2 && SA2.test(sa2) ? sa2 : null,
    compare: [...new Set(compare)].slice(0, MAX_COMPARE),
    q: q || null,
  };
}

/** "?sa2=…&compare=…&q=…" with empty keys omitted; "" when nothing is set. */
export function buildSearch(s: UrlState): string {
  const p = new URLSearchParams();
  if (s.sa2) p.set("sa2", s.sa2);
  if (s.compare.length) p.set("compare", s.compare.join(","));
  if (s.q) p.set("q", s.q);
  const out = p.toString();
  return out ? `?${out.replace(/%2C/g, ",")}` : "";
}

export function hasUrlState(s: UrlState): boolean {
  return !!(s.sa2 || s.compare.length || s.q);
}

/** Replace the current URL's query (and nothing else) when it differs. */
export function writeUrlState(s: UrlState): void {
  if (typeof window === "undefined") return;
  const next = buildSearch(s);
  const cur = window.location.search;
  if (next === cur) return;
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${next}${window.location.hash}`);
}
