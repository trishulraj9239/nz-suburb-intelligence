/**
 * TRI-32 — shared provenance primitives: the honesty mechanism made visible.
 * Every metric and answer carries a source · vintage chip and a confidence
 * marker, INCLUDING the high/exact case (previously hidden). Styling stays off
 * the amber token — amber is reserved for the citation live-wire.
 *
 * Confidence semantics (metric_values.confidence + one client-side extra):
 *   high    → exact value from the source (e.g. a census count)
 *   medium  → estimated / mapped across boundaries
 *   low     → approximate — suppression, rounding, or weak inheritance
 *   derived → computed client-side (distance, drive time), not a sourced stat
 */

const CONF_STYLE: Record<string, string> = {
  high: "border-harbour/40 bg-harbour/5 text-harbour",
  medium: "border-hairline bg-canvas text-ink/60",
  low: "border-ink/40 bg-ink/5 text-ink/70",
  derived: "border-ink/40 bg-ink/5 text-ink/70",
};
const CONF_LABEL: Record<string, string> = {
  high: "exact",
  medium: "est.",
  low: "approx",
  derived: "computed",
};
const CONF_TITLE: Record<string, string> = {
  high: "Exact value from the source",
  medium: "Estimated — derived or mapped across boundaries",
  low: "Approximate — affected by suppression, rounding, or inheritance",
  derived: "Computed here (e.g. straight-line distance), not a sourced statistic",
};

export function ConfidenceChip({ confidence }: { confidence: string }) {
  const key = confidence in CONF_STYLE ? confidence : "medium";
  return (
    <span
      title={`Confidence: ${CONF_TITLE[key]}`}
      className={`inline-flex items-center rounded-full border px-1.5 font-mono text-[9px] leading-[14px] ${CONF_STYLE[key]}`}
    >
      {CONF_LABEL[key]}
    </span>
  );
}

/** Abbreviate long source names for chip-sized surfaces. */
export function shortSource(source: string): string {
  return source.replace("NZDep2018 Deprivation Index", "NZDep2018");
}

/** Plain-text confidence label for non-React surfaces (map popup HTML). */
export function confidenceLabel(confidence: string): string {
  return CONF_LABEL[confidence in CONF_LABEL ? confidence : "medium"];
}

export function SourceChip({ source, asOf }: { source: string; asOf: string }) {
  return (
    <span className="font-mono text-[10px] text-ink/45">
      {shortSource(source)} · {asOf.slice(0, 4)}
    </span>
  );
}

/** Source · year + confidence, the per-metric provenance line. */
export function Provenance({
  source,
  asOf,
  confidence,
}: {
  source: string;
  asOf: string;
  confidence: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <SourceChip source={source} asOf={asOf} />
      <ConfidenceChip confidence={confidence} />
    </span>
  );
}
