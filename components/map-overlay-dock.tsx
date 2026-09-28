"use client";

import { useRef, useState } from "react";
import { HAZARD_CAVEAT } from "@/lib/hazard";
import { Popover } from "./popover";

export interface DockLegend {
  label: string;
  min: string;
  max: string;
  source: string;
}
export interface DockHazardLayer {
  key: string;
  label: string;
  vintage: string;
  color: string;
}

/**
 * The map's shading / hazard / legend controls in two layouts (TRI-145, Phase A).
 *
 *  ≥ lg — the top-right stack the map has always had, on the type scale.
 *  < lg — one 44 px "Layers" button bottom-left, just above the sheet's peek
 *         strip (and marked `data-nzsi-occludes` so fitPadding measures it),
 *         plus a compact legend pill beside it when shading is on. The button
 *         opens a popover with the same three controls at 44 px row heights.
 *         Before this the metric select, the 208 px hazard panel and the
 *         "Try asking" chips all fought for the top of a 390 px map.
 *
 * Rendered inside the map <section> as a <div>, so `aside:last` is still the
 * bottom sheet for the verify scripts. Copy — including the hazard caveat —
 * is unchanged.
 */
export function MapOverlayDock({
  defs,
  shadeKey,
  onShade,
  hazardLayers,
  hazardOn,
  onToggleHazard,
  legend,
  rampAlphas,
  rampRgb,
}: {
  defs: { metric_key: string; label: string }[];
  shadeKey: string;
  onShade: (key: string) => void;
  hazardLayers: readonly DockHazardLayer[];
  hazardOn: ReadonlySet<string>;
  onToggleHazard: (key: string) => void;
  legend: DockLegend | null;
  rampAlphas: readonly number[];
  rampRgb: [number, number, number];
}) {
  const [hazardsOpen, setHazardsOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const dockRef = useRef<HTMLButtonElement>(null);
  const [r, g, b] = rampRgb;

  const ramp = (
    <div className="flex h-2 w-36 max-w-full overflow-hidden rounded-sm" aria-hidden>
      {rampAlphas.map((a) => (
        <span key={a} className="h-full flex-1" style={{ background: `rgba(${r},${g},${b},${a})` }} />
      ))}
    </div>
  );

  const shadeSelect = (id: string) => (
    <select
      id={id}
      value={shadeKey}
      onChange={(e) => onShade(e.target.value)}
      aria-label="Shade map by metric"
      className="h-10 max-w-full rounded-control border border-hairline bg-surface px-2 text-label text-ink shadow-card focus:border-harbour focus:outline-none"
    >
      <option value="">No shading</option>
      {defs.map((d) => (
        <option key={d.metric_key} value={d.metric_key}>
          {d.label}
        </option>
      ))}
    </select>
  );

  const hazardList = (rowClass: string) => (
    <div>
      {hazardLayers.map((h) => (
        <label key={h.key} className={`flex cursor-pointer items-center gap-2 text-label leading-tight text-ink/85 ${rowClass}`}>
          <input type="checkbox" checked={hazardOn.has(h.key)} onChange={() => onToggleHazard(h.key)} className="h-4 w-4 accent-[var(--harbour)]" />
          <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: h.color }} />
          <span>
            {h.label} <span className="font-mono text-micro text-ink/45">{h.vintage}</span>
          </span>
        </label>
      ))}
      <p className="mt-1.5 border-t border-hairline/60 pt-1.5 text-micro leading-snug text-ink/55">{HAZARD_CAVEAT}</p>
    </div>
  );

  const legendBlock = legend && (
    <div>
      <p className="text-micro font-medium text-ink/80">{legend.label}</p>
      <div className="mt-1">{ramp}</div>
      <div className="mt-0.5 flex justify-between font-mono text-micro text-ink/55">
        <span>{legend.min}</span>
        <span>{legend.max}</span>
      </div>
      <p className="mt-0.5 text-micro text-ink/50">quintiles · darker = higher · unshaded = no data</p>
      <p className="mt-0.5 font-mono text-micro text-ink/50">{legend.source}</p>
    </div>
  );

  return (
    <>
      {/* ≥ lg: the stack */}
      <div className="absolute right-2 top-2 z-10 hidden max-w-[calc(100%-1rem)] flex-col items-end gap-2 lg:flex">
        {shadeSelect("shade-select-desktop")}
        <div className="w-60 max-w-full rounded-control border border-hairline bg-surface/95 shadow-card">
          <button
            type="button"
            onClick={() => setHazardsOpen((o) => !o)}
            aria-expanded={hazardsOpen}
            className="flex h-10 w-full items-center justify-between px-2.5 text-label text-ink"
          >
            <span>
              Hazard layers
              {hazardOn.size > 0 && <span className="ml-1 text-ink/50">({hazardOn.size} on)</span>}
            </span>
            <span aria-hidden className="font-mono text-ink/50">{hazardsOpen ? "−" : "+"}</span>
          </button>
          {hazardsOpen && <div className="border-t border-hairline px-2.5 py-1.5">{hazardList("py-1.5")}</div>}
        </div>
        {legend && <div className="rounded-control border border-hairline bg-surface/95 px-2.5 py-1.5 shadow-card">{legendBlock}</div>}
      </div>

      {/* < lg: the dock — top-right, the one corner nothing else uses on a
          phone (nav controls top-left, sheet below), so it stays reachable at
          every sheet height. */}
      <div className="absolute right-2 top-2 z-20 flex max-w-[calc(100%-4.5rem)] flex-col items-end gap-2 lg:hidden">
        <div className="relative">
          <button
            ref={dockRef}
            type="button"
            aria-label="Map layers — shading and hazard overlays"
            aria-haspopup="dialog"
            aria-expanded={dockOpen}
            onClick={() => setDockOpen((o) => !o)}
            className="inline-flex h-11 items-center gap-1.5 rounded-control border border-hairline bg-surface px-3 text-label font-medium text-ink shadow-pop transition-colors hover:border-harbour"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="m12 3 9 5-9 5-9-5 9-5Z" />
              <path d="m3 13 9 5 9-5" />
            </svg>
            Layers
            {hazardOn.size > 0 && <span className="font-mono text-micro text-ink/55">{hazardOn.size} on</span>}
          </button>
          <Popover open={dockOpen} onClose={() => setDockOpen(false)} anchorRef={dockRef} label="Map layers" side="bottom" align="end" width="w-[min(20rem,calc(100vw-1.5rem))]">
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="shade-select-phone" className="mb-1 block text-micro font-semibold uppercase tracking-wider text-ink/55">
                  Shade by
                </label>
                {shadeSelect("shade-select-phone")}
              </div>
              <div>
                <p className="mb-1 text-micro font-semibold uppercase tracking-wider text-ink/55">Hazard layers</p>
                {hazardList("min-h-11")}
              </div>
              {legendBlock}
            </div>
          </Popover>
        </div>
        {legend && !dockOpen && (
          <div className="max-w-full rounded-control border border-hairline bg-surface/95 px-2.5 py-1.5 shadow-card">
            <p className="truncate text-micro font-medium text-ink/80">{legend.label}</p>
            <div className="mt-1 flex items-center gap-2 font-mono text-micro text-ink/55">
              <span>{legend.min}</span>
              {ramp}
              <span>{legend.max}</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
