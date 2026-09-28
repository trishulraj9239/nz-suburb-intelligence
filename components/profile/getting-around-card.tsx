"use client";

import { useState } from "react";
import { formatValue, type ScalarValue } from "@/lib/suburb-data";
import { hoistChip, type StatFor } from "@/lib/sections";
import { SECTION_EXPLAINERS } from "@/lib/persona";
import { useAnchors, type Anchor } from "@/lib/preferences";
import { AUTO_ROUTED_ANCHORS, useAnchorCommutes, type CommuteResult } from "@/lib/use-anchor-commute";
import { statusFromConfidence } from "@/lib/viz/status";
import { SectionCard } from "@/components/section-card";
import { SourceChip } from "@/components/source-chip";
import { InfoTip } from "@/components/info-tip";
import { DotPlot, type Mode } from "@/components/viz/dot-plot";
import { EmptyTrack } from "@/components/viz/empty-track";
import { CardIcon } from "./icons";
import { ScalarRow } from "./rows";

const CBD_KEYS: Record<Mode, string> = { drive: "commute_cbd_drive_min", cycle: "commute_cbd_cycle_min", walk: "commute_cbd_walk_min" };
const AIRPORT_KEYS: Partial<Record<Mode, string>> = { drive: "commute_airport_drive_min" };
const KNOWN = new Set([...Object.values(CBD_KEYS), ...Object.values(AIRPORT_KEYS)]);

function destinationRow(label: string, keys: Partial<Record<Mode, string>>, byKey: Map<string, ScalarValue>, statFor: StatFor) {
  const dots = (Object.keys(keys) as Mode[]).flatMap((mode) => {
    const s = byKey.get(keys[mode]!);
    if (!s) return [];
    const st = statFor(s.def.metric_key, s.asOf);
    return [{ mode, min: s.value, status: statusFromConfidence(s.confidence), medianMin: st?.median }];
  });
  return dots.length ? { label, dots } : null;
}

/** One saved place → one drive dot, or an honest straight-line / loading row. */
function anchorRow(anchor: Anchor, r: CommuteResult) {
  const base = { label: anchor.label, sublabel: anchor.address, tag: "your place" };
  if (r === undefined) return { ...base, pending: true, dots: [] };
  if (r === null) return { ...base, status: "unavailable" as const, reason: "routing failed", dots: [] };
  if (r.fallback || r.duration_s === null) return { ...base, status: "unavailable" as const, reason: `≈${(r.distance_m / 1000).toFixed(1)} km straight line — routing unavailable`, dots: [] };
  return { ...base, dots: [{ mode: "drive" as Mode, min: r.duration_s / 60, status: "est." as const }] };
}

function AnchorRows({ sa2, anchors, scalars, byKey, statFor, hoisted }: { sa2: string; anchors: Anchor[]; scalars: ScalarValue[]; byKey: Map<string, ScalarValue>; statFor: StatFor; hoisted: boolean }) {
  const results = useAnchorCommutes(sa2, anchors);
  const rows = [destinationRow("Auckland CBD", CBD_KEYS, byKey, statFor), destinationRow("Auckland Airport", AIRPORT_KEYS, byKey, statFor), ...anchors.map((a) => anchorRow(a, results.get(a.id)))].filter((r): r is NonNullable<typeof r> => !!r);
  const routed = [...results.values()].find((r) => r && !r.fallback);
  return (
    <>
      <DotPlot rows={rows} />
      {!hoisted && scalars.length > 0 && (
        <div className="mt-1 flex flex-wrap justify-end gap-x-3">
          <SourceChip source={scalars[0].source} asOf={scalars[0].asOf} quality={statusFromConfidence(scalars[0].confidence)} />
          {routed && <SourceChip source={routed.source.name} asOf={routed.retrieved_at.slice(0, 10)} quality="est." />}
        </div>
      )}
    </>
  );
}

/**
 * TRI-148 — Getting around: one DotPlot with a row per destination (CBD,
 * Airport, then the reader's saved places) and a dot per mode on a shared
 * 0–120 min axis; beyond 90 min the row says so in words. No places saved →
 * a hatched row and an "Add a place" nudge that opens Places. Times are
 * typical, routed without live traffic — the header says so.
 */
export function GettingAroundCard({ sa2, scalars, statFor }: { sa2: string; scalars: ScalarValue[]; statFor: StatFor }) {
  const anchors = useAnchors();
  const [showAll, setShowAll] = useState(false);
  const [prevSa2, setPrevSa2] = useState(sa2);
  if (sa2 !== prevSa2) {
    setPrevSa2(sa2);
    setShowAll(false);
  }
  const byKey = new Map(scalars.map((s) => [s.def.metric_key, s]));
  const drive = byKey.get(CBD_KEYS.drive);
  const cycle = byKey.get(CBD_KEYS.cycle);
  const headline = drive ? `CBD ${formatValue(drive.def, drive.value)} by car${cycle ? `, ${formatValue(cycle.def, cycle.value)} by bike` : ""}` : undefined;
  const hoisted = hoistChip(scalars);
  const shown = showAll ? anchors : anchors.slice(0, AUTO_ROUTED_ANCHORS);
  const hidden = anchors.length - shown.length;
  const extra = scalars.filter((s) => !KNOWN.has(s.def.metric_key));
  return (
    <SectionCard
      id="commute"
      title="Getting around"
      icon={<CardIcon card="commute" />}
      accent="commute"
      headline={headline}
      explainer={
        <>
          <InfoTip label="getting around" text={SECTION_EXPLAINERS.commute} />
          <span className="ml-1.5 font-mono text-micro font-normal text-ink/45">typical · no live traffic</span>
        </>
      }
      chip={hoisted ? <SourceChip source={hoisted.source} asOf={hoisted.asOf} asOfText={hoisted.asOfText} /> : undefined}
      srTable={{
        head: ["Destination", "Minutes", "Auckland median"],
        rows: scalars.map((s) => {
          const st = statFor(s.def.metric_key, s.asOf);
          return [s.def.label, formatValue(s.def, s.value), st ? formatValue(s.def, st.median) : "—"];
        }),
      }}
    >
      <div className="py-2">
        <AnchorRows sa2={sa2} anchors={shown} scalars={scalars} byKey={byKey} statFor={statFor} hoisted={!!hoisted} />
        {anchors.length === 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="min-w-0 flex-1">
              <EmptyTrack status="unavailable" reason="no places saved" label="Your places" />
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("nzsi:open-places"))}
              className="h-10 shrink-0 rounded-control border border-hairline bg-surface px-3 text-label font-medium text-ink hover:border-harbour"
            >
              Add a place
            </button>
          </div>
        )}
        {hidden > 0 && (
          <button type="button" onClick={() => setShowAll(true)} className="mt-1 min-h-10 text-left text-label text-ink/60 underline decoration-dotted underline-offset-2 hover:text-ink">
            Show drive {hidden === 1 ? "time" : "times"} for {hidden} more {hidden === 1 ? "place" : "places"}
          </button>
        )}
      </div>
      {extra.map((s) => (
        <ScalarRow key={s.def.metric_key} s={s} stat={statFor(s.def.metric_key, s.asOf)} chip={!hoisted} />
      ))}
    </SectionCard>
  );
}
