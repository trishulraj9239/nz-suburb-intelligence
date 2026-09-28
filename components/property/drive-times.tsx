"use client";

import type { AddressPin } from "@/lib/workspace";
import { useAnchors } from "@/lib/preferences";
import { useDriveFromPin } from "@/lib/property/fetch";
import { AUTO_ROUTED_ANCHORS, FIXED_DESTINATIONS } from "@/lib/property/copy";
import { SourceChip } from "@/components/source-chip";
import { SubHeading } from "./primitives";

function DriveFromPin({ pin, label, lng, lat }: { pin: AddressPin; label: string; lng: number; lat: number }) {
  const loaded = useDriveFromPin(pin, lng, lat);
  return (
    <div className="min-h-10 py-1.5" data-testid="address-drive">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body text-ink/80">Drive to {label}</span>
        <span className="shrink-0 font-mono text-body font-medium text-ink">
          {loaded === undefined ? "…" : loaded === null ? "—" : loaded.fallback || loaded.duration_s === null ? `≈${(loaded.distance_m / 1000).toFixed(1)} km (straight line)` : `${Math.round(loaded.duration_s / 60)} min`}
        </span>
      </div>
      {loaded != null && (
        <div className="mt-0.5 flex justify-end">
          <SourceChip source={loaded.source.name} asOf={loaded.retrieved_at.slice(0, 10)} quality={loaded.fallback ? "computed" : "est."} geometry="address point" />
        </div>
      )}
    </div>
  );
}

/**
 * TRI-123 / TRI-150 — drive times FROM the address: the /api/commute engine
 * with the pin as origin, to the CBD, the airport and the reader's first saved
 * places (same quota guard as the suburb rows).
 */
export function DriveTimes({ pin }: { pin: AddressPin }) {
  const anchors = useAnchors();
  return (
    <>
      <SubHeading note="typical · no live traffic">Drive times from this address</SubHeading>
      <div className="divide-y divide-hairline/60">
        {FIXED_DESTINATIONS.map((d) => (
          <DriveFromPin key={d.id} pin={pin} label={d.label} lng={d.lng} lat={d.lat} />
        ))}
        {anchors.slice(0, AUTO_ROUTED_ANCHORS).map((a) => (
          <DriveFromPin key={a.id} pin={pin} label={a.label.toLowerCase()} lng={a.lng} lat={a.lat} />
        ))}
      </div>
    </>
  );
}
