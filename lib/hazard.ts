/**
 * Hazard-layer shared constants (TRI-70) — single source of truth for the
 * caveat wording and the hazard metric-key set, imported by both the UI
 * (profile / compare / map card) and the NL route. The caveat text is
 * VERBATIM per the M14 sign-off — do not reword one surface without the
 * others.
 */

export const HAZARD_CAVEAT =
  "Area-level model — not a property assessment. Check the council Flood Viewer and a LIM report for any specific property.";

/** metric_keys whose SourceRows carry the layer/vintage/caveat label (route). */
export const HAZARD_METRIC_KEYS = new Set([
  "flood_plain_pct",
  "overland_flow_density",
  "coastal_inundation_pct",
  "coastal_inundation_slr1m_pct",
  "liquefaction_share",
]);

/**
 * Row-label trick (commute precedent): bake layer + vintage + caveat into the
 * hazard row label server-side, so the model can only cite rows that already
 * carry the framing — deterministic, no prompt compliance required.
 */
export function hazardRowLabel(baseLabel: string, asOfDate: string): string {
  return `${baseLabel} (${asOfDate.slice(0, 4)} council layer; area-level model, not a property assessment)`;
}
