import { STATUS_TITLE, type Status } from "./status";
import { ordinal } from "./format";

/**
 * Every primitive's accessible name comes from here (TRI-147), so the same
 * fact reads the same way whether it is drawn or announced. The status word
 * is always present — the gallery verify asserts it.
 */
const tail = (status: Status, reason?: string) => (reason ? `${status}: ${reason}` : status === "exact" ? "exact" : STATUS_TITLE[status].toLowerCase());

export function bulletLabel(a: { label: string; value: string; pct: number; median: string; status: Status; reason?: string }): string {
  if (a.status === "suppressed" || a.status === "unavailable") return `${a.label}, ${tail(a.status, a.reason)}`;
  return `${a.label} ${a.value}, ${ordinal(a.pct)} percentile of Auckland (median ${a.median}), ${a.status}`;
}

export function rangeLabel(a: { label: string; lo: string; mid: string; hi: string; status: Status; reason?: string }): string {
  if (a.status === "suppressed" || a.status === "unavailable") return `${a.label}, ${tail(a.status, a.reason)}`;
  return `${a.label}: lower quartile ${a.lo}, median ${a.mid}, upper quartile ${a.hi}, ${a.status}`;
}

export function seriesLabel(a: { label: string; first: string; last: string; firstAsOf: string; lastAsOf: string; delta: string; status: Status; reason?: string }): string {
  if (a.status === "suppressed" || a.status === "unavailable") return `${a.label}, ${tail(a.status, a.reason)}`;
  return `${a.label}: ${a.first} in ${a.firstAsOf} to ${a.last} in ${a.lastAsOf}${a.delta ? ` (${a.delta})` : ""}, ${a.status}`;
}

export function compositionLabel(a: { label: string; parts: { label: string; pct: number }[]; status: Status; reason?: string }): string {
  if (a.status === "suppressed" || a.status === "unavailable") return `${a.label}, ${tail(a.status, a.reason)}`;
  return `${a.label}: ${a.parts.map((p) => `${p.label} ${Math.round(p.pct)}%`).join(", ")}, ${a.status}`;
}

export function decileLabel(a: { label: string; value: number; cells: number; low: string; high: string; status: Status; reason?: string }): string {
  if (a.status === "suppressed" || a.status === "unavailable") return `${a.label}, ${tail(a.status, a.reason)}`;
  return `${a.label} ${a.value} of ${a.cells} (1 = ${a.low}, ${a.cells} = ${a.high}), ${a.status}`;
}

export function layersLabel(a: { above: number; total: number; layers: { label: string; value: string; median: string; status: Status }[] }): string {
  return `${a.above} of ${a.total} layers above the Auckland median. ${a.layers.map((l) => `${l.label} ${l.value} (Auckland median ${l.median}), ${l.status}`).join("; ")}`;
}

export function dotPlotLabel(a: { label: string; dots: { mode: string; text: string; status: Status }[] }): string {
  return `${a.label}: ${a.dots.map((d) => `${d.mode} ${d.text}, ${d.status}`).join("; ")}`;
}

export function dotStripLabel(a: { label: string; dots: { name: string; value: string; status: Status; best?: boolean }[]; median?: string }): string {
  return `${a.label}: ${a.dots.map((d) => `${d.name} ${d.value}${d.best ? " (best)" : ""}, ${d.status}`).join("; ")}${a.median ? `; Auckland median ${a.median}` : ""}`;
}
