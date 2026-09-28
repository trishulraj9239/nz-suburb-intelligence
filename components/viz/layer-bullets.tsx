import type { RegionalStat } from "@/lib/suburb-data";
import { axisPct } from "@/lib/viz/scale";
import { layersLabel } from "@/lib/viz/aria";
import { isEmpty, type Status } from "@/lib/viz/status";
import { HZ } from "@/lib/viz/palettes";
import { AxisTrack } from "./axis-track";
import { Marker } from "./marker";
import { EmptyTrack } from "./empty-track";

/**
 * Count of layers (TRI-147): the hazard screen. Four SEPARATE bullets on the
 * neutral grey ramp plus the badge "N of M layers above the Auckland median" —
 * a countable fact, never a blended index, never a hue that reads as danger.
 */
export function LayerBullets({
  layers,
  className = "",
}: {
  layers: { label: string; value: number | null; stat?: RegionalStat; format: (v: number) => string; status: Status; reason?: string; vintage?: string }[];
  className?: string;
}) {
  const judged = layers.filter((l) => l.value != null && l.stat && !isEmpty(l.status));
  const above = judged.filter((l) => l.value! > l.stat!.median).length;
  const aria = layersLabel({
    above,
    total: judged.length,
    layers: layers.map((l) => ({ label: l.label, value: l.value != null ? l.format(l.value) : "—", median: l.stat ? l.format(l.stat.median) : "—", status: l.status })),
  });
  return (
    <div className={className}>
      <p className="mb-1.5 inline-block rounded-chip border border-hairline bg-canvas px-2 py-0.5 font-mono text-micro font-medium text-ink/85" data-testid="hazard-count">
        {`${above} of ${judged.length} ${judged.length === 1 ? "layer" : "layers"} above the Auckland median`}
      </p>
      <div role="img" aria-label={aria} className="flex flex-col gap-1.5">
        {layers.map((l) => (
          <div key={l.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5">
            <span className="text-label text-ink/80">
              {l.label}
              {l.vintage && <span className="ml-1 font-mono text-micro text-ink/45">{l.vintage}</span>}
            </span>
            <span className="font-mono text-value font-medium text-ink">{l.value != null && !isEmpty(l.status) ? l.format(l.value) : "—"}</span>
            <div className="col-span-2">
              {l.value == null || !l.stat || isEmpty(l.status) ? (
                <EmptyTrack status={isEmpty(l.status) ? l.status : "unavailable"} reason={l.reason} label={l.label} height={6} />
              ) : (
                <svg width="100%" height={12} className="block overflow-visible" aria-hidden>
                  <AxisTrack stat={l.stat} mid={6} trackColor={HZ.track} tickColor={HZ.tick} />
                  <Marker x={`${axisPct(l.value, l.stat).toFixed(2)}%`} status={l.status} color={HZ.marker} height={10} />
                </svg>
              )}
            </div>
            {l.stat && (
              <span className="col-span-2 font-mono text-micro text-ink/50">Auckland median {l.format(l.stat.median)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
