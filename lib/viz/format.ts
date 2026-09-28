/** Small formatting helpers for the primitives (TRI-147). */

/** 72 → "72nd", 1 → "1st", 13 → "13th". */
export function ordinal(n: number): string {
  const v = Math.round(n);
  const s = ["th", "st", "nd", "rd"];
  const r = v % 100;
  return `${v}${s[(r - 20) % 10] ?? s[r] ?? s[0]}`;
}

/** "72nd percentile of Auckland" — the label beside every scalar value. */
export function percentileLabel(pct: number): string {
  return `${ordinal(pct)} percentile of Auckland`;
}

/** Signed delta in mono: "+4.2%", "−$30/wk", "0". */
export function deltaText(from: number, to: number, unit?: string | null, asPct = false): string {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "";
  if (asPct) {
    if (from === 0) return "";
    const p = ((to - from) / Math.abs(from)) * 100;
    return `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}%`;
  }
  const d = to - from;
  const abs = Math.abs(d);
  const num = abs >= 100 ? Math.round(abs).toLocaleString() : abs.toFixed(abs >= 10 ? 0 : 1);
  return `${d > 0 ? "+" : d < 0 ? "−" : ""}${unit === "$/week" ? "$" : ""}${num}${unit === "$/week" ? "/wk" : unit === "%" ? " pts" : ""}`;
}

export const yearOf = (asOf: string) => asOf.slice(0, 4);
