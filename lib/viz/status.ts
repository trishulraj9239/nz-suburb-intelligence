/**
 * Status vocabulary shared by every primitive (TRI-147). Quality is the four
 * words the app has used on chips since TRI-32; the two empty states are new
 * and render a hatched full-length track, never a zero-length bar.
 */
export type Quality = "exact" | "est." | "approx" | "computed";
export type Status = Quality | "suppressed" | "unavailable";

export const QUALITY_FROM_CONFIDENCE: Record<string, Quality> = {
  high: "exact",
  medium: "est.",
  low: "approx",
  derived: "computed",
};

/** metric_values.confidence (high / medium / low / derived) → chip word. */
export function statusFromConfidence(confidence: string): Quality {
  return QUALITY_FROM_CONFIDENCE[confidence] ?? "est.";
}

/** One sentence per status — the `title` on every quality mark (verify scripts read `[title^='Confidence:']`). */
export const STATUS_TITLE: Record<Status, string> = {
  exact: "Exact value from the source",
  "est.": "Estimated — derived or mapped across boundaries",
  approx: "Approximate — affected by suppression, rounding, or inheritance",
  computed: "Computed here (e.g. straight-line distance), not a sourced statistic",
  suppressed: "Suppressed by the source — too few responses to publish",
  unavailable: "Not available — the source could not be reached or does not cover this area",
};

export const isEmpty = (s: Status): s is "suppressed" | "unavailable" => s === "suppressed" || s === "unavailable";
/** Estimates and approximations draw an OUTLINED marker: quality is carried by shape, not colour alone (WCAG 1.4.1). */
export const isOutlined = (s: Status) => s === "est." || s === "approx";
/** Computed figures draw a dashed outline. */
export const isDashed = (s: Status) => s === "computed";
