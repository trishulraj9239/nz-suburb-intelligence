import { STATUS_TITLE, statusFromConfidence, type Quality, type Status } from "@/lib/viz/status";

/**
 * TRI-32 / TRI-147 — the honesty mechanism made visible, now one component.
 * Every figure carries source · as-of · [tested geometry] · quality, in that
 * order, in IBM Plex Mono at the 12 px floor; quality is the ONLY coloured
 * element and carries its one-sentence meaning in `title` (touch surfaces get
 * the same sentence through the legend). Styling stays off amber — amber is
 * reserved for the citation live-wire.
 *
 * Quality semantics (metric_values.confidence + one client-side extra):
 *   exact    → exact value from the source (e.g. a census count)
 *   est.     → estimated / mapped across boundaries
 *   approx   → approximate — suppression, rounding, or weak inheritance
 *   computed → computed client-side (distance, drive time), not a sourced stat
 */

const STYLE: Record<Status, string> = {
  exact: "border-harbour/60 bg-harbour/10 text-ink",
  "est.": "border-hairline bg-canvas text-ink/65",
  approx: "border-ink/40 bg-ink/5 text-ink/75",
  computed: "border-ink/40 bg-ink/5 text-ink/75",
  suppressed: "border-hairline bg-transparent text-ink/50 nzsi-hatch",
  unavailable: "border-hairline bg-transparent text-ink/50 nzsi-hatch",
};
const WORD: Record<Status, string> = { exact: "exact", "est.": "est.", approx: "approx", computed: "computed", suppressed: "not published", unavailable: "not available" };

export type Geometry = "address point" | "rating unit" | "within 20 m" | "within 30 m" | "SA1 block";

export function QualityMark({ status }: { status: Status }) {
  return (
    <span title={`Confidence: ${STATUS_TITLE[status]}`} className={`inline-flex items-center rounded-chip border px-1.5 font-mono text-micro leading-4 ${STYLE[status]}`}>
      {WORD[status]}
    </span>
  );
}

/** Kept for existing call sites: confidence word in, chip out. */
export function ConfidenceChip({ confidence }: { confidence: string }) {
  return <QualityMark status={statusFromConfidence(confidence)} />;
}

/** Abbreviate long source names for chip-sized surfaces. */
export function shortSource(source: string): string {
  return source.replace(/NZDep(\d{4}) Deprivation Index/, "NZDep$1").replace("Tenancy bond data (quarterly, SA2)", "MBIE Tenancy bonds");
}

/** Quarter-start dates (the MBIE bond series) label as "2026 Q1"; all other vintages stay year-only. */
export function asOfLabel(asOf: string): string {
  const m = asOf.match(/^(\d{4})-(01|04|07|10)-01$/);
  return m ? `${m[1]} Q${{ "01": 1, "04": 2, "07": 3, "10": 4 }[m[2]]}` : asOf.slice(0, 4);
}

/** Plain-text confidence label for non-React surfaces (map popup HTML). */
export function confidenceLabel(confidence: string): string {
  return WORD[statusFromConfidence(confidence)];
}

export function SourceChip({
  source,
  asOf,
  quality,
  geometry,
  asOfText,
  className = "",
}: {
  source: string;
  asOf: string;
  quality?: Quality | Status;
  geometry?: Geometry;
  /** Override the vintage text, e.g. a range "2025–2026" when a hoisted chip spans several layer dates. */
  asOfText?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 font-mono text-micro text-ink/55 ${className}`}>
      <span className="min-w-0 text-right">
        {shortSource(source)} · {asOfText ?? asOfLabel(asOf)}
        {geometry && <span className="text-ink/70"> · {geometry}</span>}
      </span>
      {quality && <QualityMark status={quality} />}
    </span>
  );
}

/** Source + quality in one line — the row-level provenance line (legacy signature). */
export function Provenance({ source, asOf, confidence, geometry }: { source: string; asOf: string; confidence: string; geometry?: Geometry }) {
  return <SourceChip source={source} asOf={asOf} quality={statusFromConfidence(confidence)} geometry={geometry} />;
}

/** Legend explaining the quality words — the touch-friendly twin of the `title` sentences. */
export function ConfidenceLegend() {
  const items: Status[] = ["exact", "est.", "approx", "computed", "suppressed"];
  return (
    <dl className="mt-3 flex flex-col gap-1 border-t border-hairline pt-2 text-micro text-ink/60">
      {items.map((s) => (
        <div key={s} className="flex items-baseline gap-2">
          <dt className="shrink-0">
            <QualityMark status={s} />
          </dt>
          <dd>{STATUS_TITLE[s]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Point-check status words with an icon so meaning never rests on colour (TRI-147). */
export type PillStatus = "inside" | "within" | "outside" | "clear" | "not assessed" | "unavailable" | "pending";
const PILL_ICON: Record<PillStatus, string> = { inside: "■", within: "◆", outside: "□", clear: "◇", "not assessed": "–", unavailable: "⋯", pending: "…" };
export function StatusPill({ status, text }: { status: PillStatus; text: string }) {
  const muted = status === "unavailable" || status === "pending" || status === "not assessed";
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-label font-medium ${muted ? "text-ink/50" : "text-ink"}`} data-pill={status}>
      <span aria-hidden className={status === "unavailable" ? "nzsi-hatch inline-block h-3 w-3 rounded-[2px] border border-hairline" : ""}>
        {status === "unavailable" ? "" : PILL_ICON[status]}
      </span>
      {text}
    </span>
  );
}
