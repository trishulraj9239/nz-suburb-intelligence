"use client";

import type { SuburbProfile } from "@/lib/suburb-data";
import type { AddressPin } from "@/lib/workspace";
import { DOT_IDS, LETTER } from "@/lib/compare";
import { CAT_COLOR } from "@/lib/viz/palettes";
import { ConfidenceChip } from "@/components/source-chip";

/**
 * TRI-141 — a column headed by the address(es) pinned in this SA2, sub-headed
 * by the area the figures belong to. Two addresses in one area share the
 * entry with an explicit note — never two identical entries dressed up as a
 * comparison.
 */
export function AddressHead({ addresses, suburb }: { addresses: AddressPin[]; suburb: string }) {
  return (
    <span className="block" data-testid="compare-address-head">
      {addresses.map((a) => (
        <span key={a.label} className="block">
          {a.label}
        </span>
      ))}
      <span className="mt-0.5 block font-mono text-micro font-normal text-ink/50">area: {suburb}</span>
      {addresses.length > 1 && (
        <span className="mt-0.5 block font-mono text-micro font-normal text-ink/60" data-testid="same-area-note">
          both addresses are in the same statistical area, so area figures are identical
        </span>
      )}
    </span>
  );
}

/** The letter-and-hue badge every row reuses (TRI-149). */
export function Letter({ id, className = "" }: { id: (typeof DOT_IDS)[number]; className?: string }) {
  return (
    <span aria-hidden className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-ink font-mono text-micro font-bold text-mark-ink ${className}`} style={{ background: CAT_COLOR[id] }}>
      {LETTER[id]}
    </span>
  );
}

/**
 * TRI-149 — the legend that replaces per-suburb columns: one entry per compared
 * suburb with its letter + hue, the address head where one is pinned, the CBD
 * distance, and the remove control (same aria-label as before, tri83 counts it).
 */
export function CompareHeader({ profiles, pinsFor, onOpen, onRemove }: { profiles: SuburbProfile[]; pinsFor: (sa2: string) => AddressPin[]; onOpen: (sa2: string) => void; onRemove: (sa2: string) => void }) {
  return (
    <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${profiles.length}, minmax(0, 1fr))` }} aria-label="Compared suburbs">
      {profiles.map((p, i) => {
        const id = DOT_IDS[i];
        const addresses = pinsFor(p.suburb.sa2_code);
        return (
          <li key={p.suburb.sa2_code} className="flex min-w-0 flex-col gap-1 rounded-card border border-hairline bg-canvas/60 p-2" data-testid="compare-suburb">
            <div className="flex items-start justify-between gap-1">
              <button type="button" onClick={() => onOpen(p.suburb.sa2_code)} className="flex min-w-0 items-start gap-1.5 text-left font-display text-label font-semibold leading-tight text-ink hover:text-harbour" title="Open profile">
                <Letter id={id} className="mt-0.5" />
                <span className="min-w-0">{addresses.length ? <AddressHead addresses={addresses} suburb={p.suburb.name} /> : p.suburb.name}</span>
              </button>
              <button type="button" onClick={() => onRemove(p.suburb.sa2_code)} aria-label={`Remove ${p.suburb.name} from comparison`} className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-control font-mono text-label text-ink/45 hover:bg-hairline/60 hover:text-ink">
                ✕
              </button>
            </div>
            {p.cbdKm != null && (
              <p className="flex flex-wrap items-center gap-1 font-mono text-micro text-ink/55" title={p.cbdMethod === "road" ? "Driving distance to the CBD via openrouteservice/OSM — typical route" : "Straight-line to the CBD — road routing unavailable for this suburb"}>
                CBD {p.cbdKm.toFixed(1)} km{p.cbdMethod === "road" ? " by road" : ""} <ConfidenceChip confidence="derived" />
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
