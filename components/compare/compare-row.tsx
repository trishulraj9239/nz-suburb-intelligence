"use client";

import type { ReactNode } from "react";
import type { RegionalStat } from "@/lib/suburb-data";
import { LETTER, type Entry } from "@/lib/compare";
import { statusFromConfidence, type Status } from "@/lib/viz/status";
import { DotStrip } from "@/components/viz/dot-strip";
import { EmptyTrack } from "@/components/viz/empty-track";
import { QualityMark, SourceChip } from "@/components/source-chip";
import { Letter } from "./compare-header";

/**
 * TRI-112 — "best of your set" chip. Rendered ONLY for metrics whose registry
 * row declares a direction (higher_is_better true/false); deprivation,
 * consents and hazard are NULL there and stay unjudged — a "best" marker on a
 * verdict-free metric would contradict the whole framing. Harbour tint, never
 * amber: amber is the citation live-wire.
 */
export function BestChip() {
  return (
    <span title="Best of your compared set on this metric, per the registry's higher/lower-is-better direction" className="inline-flex items-center rounded-chip border border-harbour/60 bg-harbour/10 px-1.5 font-mono text-micro leading-4 text-ink">
      best
    </span>
  );
}

export function UnjudgedMark() {
  return (
    <span title="This metric carries no better/worse direction — deprivation, consents and hazard are information, not verdicts, so no best is marked." className="font-mono text-micro text-ink/50">
      unjudged
    </span>
  );
}

/**
 * TRI-149 — one metric, all compared suburbs: label | DotStrip on the shared
 * regional axis (or a plain domain) | a value per suburb with its letter and
 * badges | provenance. Phones stack the three; from `lg` label and values
 * flank the strip. A suburb with no value gets "—" and no dot; the row's
 * status stays whatever the present values carry.
 */
export function CompareRow({
  testId,
  label,
  explainer,
  entries,
  stat,
  domain,
  format,
  best,
  judged,
  badges,
  shared,
  reason,
}: {
  testId: string;
  label: ReactNode;
  explainer?: ReactNode;
  entries: Entry[];
  stat?: RegionalStat;
  domain?: [number, number];
  format: (v: number) => string;
  best: Set<string>;
  judged: boolean;
  badges?: (e: Entry) => ReactNode;
  shared: { source: string; asOf: string; confidence: string | null } | null;
  reason?: string;
}) {
  const live = entries.filter((e) => e.value != null);
  const labelText = typeof label === "string" ? label : "metric";
  const rowStatus: Status = live.length ? statusFromConfidence(live[0].confidence ?? "medium") : "unavailable";
  return (
    <div data-testid={testId} className="grid grid-cols-1 gap-y-1 py-2 lg:grid-cols-[9rem_minmax(0,1fr)_auto] lg:items-center lg:gap-x-3">
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-body leading-snug text-ink/85">
        {label}
        {explainer}
        {!judged && <UnjudgedMark />}
      </span>
      <div className="min-w-0">
        {live.length === 0 ? (
          <EmptyTrack status="unavailable" reason={reason ?? "not published for these areas"} label={labelText} />
        ) : (
          <DotStrip
            label={labelText}
            stat={stat}
            domain={domain}
            format={format}
            dots={entries.map((e) => ({ id: e.id, name: e.name, initial: LETTER[e.id], value: e.value, status: statusFromConfidence(e.confidence ?? "medium"), best: best.has(e.code) }))}
          />
        )}
      </div>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-0.5 lg:flex-col lg:items-end lg:gap-y-0" aria-label={`${labelText} by suburb`}>
        {entries.map((e) => (
          <li key={e.code} className="flex items-center gap-1.5 whitespace-nowrap">
            <Letter id={e.id} />
            <span className="sr-only">{e.name}</span>
            <span className={`font-mono text-value font-medium ${e.value == null ? "text-ink/40" : "text-ink"}`}>{e.value == null ? "—" : format(e.value)}</span>
            {e.value != null && best.has(e.code) && <BestChip />}
            {e.value != null && badges?.(e)}
            {e.value != null && (!shared || shared.confidence === null) && e.confidence && <QualityMark status={statusFromConfidence(e.confidence)} />}
          </li>
        ))}
      </ul>
      {shared && (
        <div className="flex justify-end lg:col-span-3">
          <SourceChip source={shared.source} asOf={shared.asOf} quality={shared.confidence ? statusFromConfidence(shared.confidence) : undefined} />
        </div>
      )}
      {!shared && live.length > 0 && (
        <div className="flex flex-wrap justify-end gap-x-3 lg:col-span-3">
          {[...new Map(live.map((e) => [`${e.source}|${e.asOf}`, e])).values()].map((e) => (
            <span key={`${e.source}|${e.asOf}`} className="inline-flex items-center gap-1">
              <Letter id={e.id} />
              <SourceChip source={e.source!} asOf={e.asOf!} />
            </span>
          ))}
        </div>
      )}
      <span className="sr-only" data-status={rowStatus} />
    </div>
  );
}
