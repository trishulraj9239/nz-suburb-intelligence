"use client";

import { useEffect, useState } from "react";
import { Provenance } from "@/components/provenance";
import { HAZARD_CAVEAT } from "@/lib/hazard";
import { useAnchors } from "@/lib/preferences";
import type { AddressPin } from "@/lib/workspace";

/**
 * TRI-123 — "At this address": the two things that are honestly answerable for
 * a POINT rather than an area.
 *
 *   1. Hazard layers at the point — one live point-in-layer query per council
 *      layer (/api/point-hazards), each reported in the layer's own words with
 *      the verbatim area-level caveat. No count, no band, no verdict.
 *   2. Drive times FROM the address — the existing /api/commute engine with the
 *      pin as origin, to the CBD, the airport and the user's first saved
 *      anchors (same quota guard as the suburb rows).
 *
 * Everything else on the profile is the area's; this block never repeats an
 * area figure as if it were the property's.
 */

interface PointHazardLayer {
  key: string;
  label: string;
  vintage: string;
  status: string;
  inside: boolean | null;
}
interface PointHazardResponse {
  layers: PointHazardLayer[];
  caveat: string;
  source: string;
  retrieved_at: string;
}
interface CommuteResponse {
  duration_s: number | null;
  distance_m: number;
  fallback: boolean;
  source: { name: string };
  retrieved_at: string;
}
// TRI-126 — public land records at the point (LINZ, live).
interface PropertyUnit {
  source_id: string;
  title_type: string | null;
  area_m2: number | null;
  legal_description: string | null;
  valuation_reference: string | null;
  title_nos: string[];
}
interface PropertyTitle {
  title_no: string;
  type: string | null;
  status: string | null;
  issue_date: string | null;
  estate_description: string | null;
}
interface PropertyFactsResponse {
  units: PropertyUnit[];
  titles: PropertyTitle[];
  source: string;
  licence: string;
  retrieved_at: string;
  unavailable?: string;
}
const TITLE_TYPE_NOTE: Record<string, string> = {
  Freehold: "Fee simple: the owner holds the land and buildings outright.",
  "Cross lease": "Owners jointly own the land and lease their own flat's footprint from each other; changes to the building can need the other lessees' consent.",
  "Unit Title": "Ownership of a unit within a body corporate development, with shared common property and body corporate rules and levies.",
  Leasehold: "The land is leased from a separate owner for a term; ground rent applies and the lease has an expiry.",
};

const STATUS_WORDS: Record<string, string> = {
  inside: "inside",
  outside: "outside",
  within: "within 20 m",
  clear: "none within 20 m",
  unavailable: "council service unavailable — not checked",
  "not assessed": "not in the assessed area",
};

// Fixed destinations, identical to the commute anchors the suburb matrix uses
// (migration 0006): CBD = Britomart, airport = terminal drop-off.
const FIXED_DESTINATIONS = [
  { id: "cbd", label: "Auckland CBD", lng: 174.7691, lat: -36.8442 },
  { id: "airport", label: "Auckland Airport", lng: 174.78675, lat: -37.00436 },
];
const AUTO_ROUTED_ANCHORS = 3;

function DriveFromPin({ pin, label, lng, lat }: { pin: AddressPin; label: string; lng: number; lat: number }) {
  const key = `${pin.lng},${pin.lat}|${lng},${lat}`;
  const [state, setState] = useState<{ key: string; r: CommuteResponse | null } | null>(null);
  useEffect(() => {
    let stale = false;
    fetch("/api/commute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ origin: { lng: pin.lng, lat: pin.lat }, destination: { lng, lat }, mode: "driving-car" }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((r: CommuteResponse | null) => {
        if (!stale) setState({ key, r });
      })
      .catch(() => {
        if (!stale) setState({ key, r: null });
      });
    return () => {
      stale = true;
    };
  }, [key, pin.lng, pin.lat, lng, lat]);
  const loaded = state?.key === key ? state.r : undefined;
  return (
    <div className="py-1.5" data-testid="address-drive">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-ink/80">Drive to {label}</span>
        <span className="shrink-0 font-mono text-sm font-medium text-ink">
          {loaded === undefined
            ? "…"
            : loaded === null
              ? "—"
              : loaded.fallback || loaded.duration_s === null
                ? `≈${(loaded.distance_m / 1000).toFixed(1)} km (straight line)`
                : `${Math.round(loaded.duration_s / 60)} min`}
        </span>
      </div>
      {loaded != null && (
        <div className="mt-0.5 flex justify-end">
          <Provenance source={loaded.source.name} asOf={loaded.retrieved_at.slice(0, 10)} confidence={loaded.fallback ? "derived" : "medium"} />
        </div>
      )}
    </div>
  );
}

export function AddressFacts({ pin }: { pin: AddressPin }) {
  const anchors = useAnchors();
  const [hz, setHz] = useState<{ key: string; r: PointHazardResponse | null | "error" }>({ key: "", r: null });
  const key = `${pin.lng},${pin.lat}`;

  useEffect(() => {
    let stale = false;
    setHz({ key, r: null });
    fetch(`/api/point-hazards?lng=${pin.lng}&lat=${pin.lat}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((r: PointHazardResponse) => {
        if (!stale) setHz({ key, r });
      })
      .catch(() => {
        if (!stale) setHz({ key, r: "error" });
      });
    return () => {
      stale = true;
    };
  }, [key, pin.lng, pin.lat]);

  const hazards = hz.key === key ? hz.r : null;

  // TRI-126 — title & land from LINZ (live, cached server-side).
  const [pf, setPf] = useState<{ key: string; r: PropertyFactsResponse | null | "error" }>({ key: "", r: null });
  useEffect(() => {
    let stale = false;
    setPf({ key, r: null });
    fetch(`/api/property-facts?lng=${pin.lng}&lat=${pin.lat}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((r: PropertyFactsResponse) => {
        if (!stale) setPf({ key, r });
      })
      .catch(() => {
        if (!stale) setPf({ key, r: "error" });
      });
    return () => {
      stale = true;
    };
  }, [key, pin.lng, pin.lat]);
  const property = pf.key === key ? pf.r : null;

  return (
    <section data-testid="address-facts" className="rounded-md border border-hairline bg-canvas/60 p-3">
      <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-ink/60">
        At this address
        <span className="ml-1.5 font-mono text-[10px] font-normal normal-case tracking-normal text-ink/40">point checks · not a property assessment</span>
      </h3>

      <h4 className="mt-2 text-[11px] font-medium uppercase tracking-wider text-ink/45">Title &amp; land — LINZ public records</h4>
      {property === null && <p className="py-1 text-xs text-ink/50">Reading the LINZ land records…</p>}
      {(property === "error" || (property && property.unavailable)) && (
        <p className="py-1 text-xs text-ink/60" data-testid="property-unavailable">
          LINZ could not be reached — the title was not checked.
        </p>
      )}
      {property && property !== "error" && !property.unavailable && property.units.length === 0 && (
        <p className="py-1 text-xs text-ink/60" data-testid="property-none">
          No rating unit or title is linked to this point in LINZ&apos;s public records.
        </p>
      )}
      {property && property !== "error" && !property.unavailable && property.units.length > 0 && (
        <div data-testid="property-facts">
          {property.units.map((u) => (
            <div key={u.source_id} className="border-b border-hairline/60 py-1.5 last:border-b-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-ink/80">Title type</span>
                <span className="font-mono text-sm font-medium text-ink" data-testid="title-type">{u.title_type ?? "—"}</span>
              </div>
              {u.title_type && TITLE_TYPE_NOTE[u.title_type] && (
                <p className="mt-0.5 text-[10px] leading-snug text-ink/50">{TITLE_TYPE_NOTE[u.title_type]}</p>
              )}
              {u.area_m2 != null && (
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="text-sm text-ink/80">Rating unit land area</span>
                  <span className="font-mono text-sm font-medium text-ink">{u.area_m2.toLocaleString()} m²</span>
                </div>
              )}
              {u.legal_description && (
                <p className="mt-1 text-[11px] leading-snug text-ink/60">
                  <span className="text-ink/45">Legal description</span> {u.legal_description}
                </p>
              )}
            </div>
          ))}
          {property.titles.map((t) => (
            <div key={t.title_no} className="py-1.5 text-[11px] leading-snug text-ink/65">
              <span className="font-mono text-ink/80">Title {t.title_no}</span>
              {t.type ? ` · ${t.type}` : ""}
              {t.issue_date ? ` · issued ${t.issue_date}` : ""}
              {t.status && t.status !== "LIVE" ? ` · ${t.status.toLowerCase()}` : ""}
              {t.estate_description &&
                t.estate_description.split(/\r?\n/).map((line, i) => (
                  <span key={i} className="block text-ink/55">
                    {line}
                  </span>
                ))}
            </div>
          ))}
          <p className="mt-1 text-[10px] leading-snug text-ink/50">
            Public records about the land, not a valuation or an inspection. Ownership is not public data — a lawyer can obtain the full title.
          </p>
          <div className="mt-1 flex justify-end">
            <Provenance source="LINZ Property Boundaries + Titles" asOf={property.retrieved_at.slice(0, 10)} confidence="high" />
          </div>
        </div>
      )}

      <h4 className="mt-2 text-[11px] font-medium uppercase tracking-wider text-ink/45">Council hazard layers at this point</h4>
      {hazards === null && <p className="py-1 text-xs text-ink/50">Checking the council layers…</p>}
      {hazards === "error" && (
        <p className="py-1 text-xs text-ink/60">The council hazard services could not be reached — nothing was checked.</p>
      )}
      {hazards && hazards !== "error" && (
        <>
          <ul className="divide-y divide-hairline/60">
            {hazards.layers.map((l) => (
              <li key={l.key} className="flex items-baseline justify-between gap-2 py-1.5" data-testid="point-hazard">
                <span className="text-sm text-ink/80">
                  {l.label}
                  <span className="ml-1 font-mono text-[10px] text-ink/45">{l.vintage} layer</span>
                </span>
                <span className={`shrink-0 font-mono text-sm font-medium ${l.status === "unavailable" ? "text-ink/45" : "text-ink"}`}>
                  {STATUS_WORDS[l.status] ?? l.status}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] leading-snug text-ink/50">{hazards.caveat || HAZARD_CAVEAT}</p>
          <div className="mt-1 flex justify-end">
            <Provenance source={hazards.source} asOf={hazards.retrieved_at.slice(0, 10)} confidence="medium" />
          </div>
        </>
      )}

      <h4 className="mt-3 text-[11px] font-medium uppercase tracking-wider text-ink/45">
        Drive times from this address
        <span className="ml-1.5 font-mono text-[10px] font-normal normal-case tracking-normal text-ink/40">typical · no live traffic</span>
      </h4>
      <div className="divide-y divide-hairline/60">
        {FIXED_DESTINATIONS.map((d) => (
          <DriveFromPin key={d.id} pin={pin} label={d.label} lng={d.lng} lat={d.lat} />
        ))}
        {anchors.slice(0, AUTO_ROUTED_ANCHORS).map((a) => (
          <DriveFromPin key={a.id} pin={pin} label={a.label.toLowerCase()} lng={a.lng} lat={a.lat} />
        ))}
      </div>
    </section>
  );
}
