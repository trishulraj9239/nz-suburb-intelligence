"use client";

import { useEffect, useState } from "react";
import { AerialThumb } from "@/components/aerial-thumb";
import { Provenance } from "@/components/provenance";
import { HAZARD_CAVEAT } from "@/lib/hazard";
import { LINK_OUTS } from "@/lib/link-outs";
import { useAnchors } from "@/lib/preferences";
import type { AddressPin } from "@/lib/workspace";

/**
 * TRI-133 — "This property (public records)": the address-level surface.
 * Three groups, each headed by its epistemic level so a reader can never
 * mistake one for another:
 *   Public records about the land  — LINZ title & land (TRI-126)
 *   Area-level models at this point — council hazard layers (verbatim caveat
 *                                     top and foot) and drive times (TRI-123)
 *   Not held by this app            — the link-outs, with reasons (TRI-132)
 * Sections for tickets not yet shipped (built form, overlays, extended
 * hazards, block stats, nearby, schools) are simply absent — never "N/A".
 * No aggregate, score, badge or colour implies a verdict on the property.
 *
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
  edited?: string | null;
  status: string;
  inside: boolean | null;
  /** TRI-129 — the record's own detail on a hit (depth, model, class wording). */
  detail?: string | null;
}
const FLOOD_VIEWER_URL = "https://experience.arcgis.com/experience/cbde7f2134404f4d90adce5396a0a630";
const HAIL_NOTE = "Contaminated land (HAIL) status is not openly published — a LIM report is the only source.";
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
// TRI-127 — building outlines on the rating unit (LINZ, live).
interface BuiltFormResponse {
  none?: boolean;
  unit_area_m2: number | null;
  building_count: number;
  footprint_m2: number | null;
  site_coverage_pct: number | null;
  outlines: { building_id: string; use: string | null; name: string | null; area_m2: number; on_unit_m2: number; capture_from: string | null; capture_to: string | null }[];
  outlines_captured: string | null;
  imagery: { title: string; from: string | null; to: string | null } | null;
  source: string;
  retrieved_at: string;
  unavailable?: string;
}
const BUILT_FORM_NOTE = "Roof outlines from LINZ aerial imagery; not floor area, not a consent record.";

// TRI-128 — Unitary Plan overlays at the point (council services, live).
interface OverlayHit {
  name: string | null;
  type: string | null;
  subtype: string | null;
  schedule: string | null;
  version: string | null;
  document_url: string | null;
}
interface OverlayLayer {
  key: string;
  label: string;
  chapter: string;
  kind: "polygon" | "point";
  status: string;
  inside: boolean | null;
  hits: OverlayHit[];
}
interface OverlaysResponse {
  layers: OverlayLayer[];
  source: string;
  updated: string | null;
  retrieved_at: string;
}
const OVERLAY_STATUS: Record<string, string> = {
  inside: "inside",
  near: "on or near the boundary",
  outside: "outside",
  within: "within 30 m",
  none: "none within 30 m",
  unavailable: "council service unavailable — not checked",
};
const AUP_HOME = "https://unitaryplan.aucklandcouncil.govt.nz/";
const OVERLAY_NOTE =
  "Operative overlays as published by the council; descriptive only — what an overlay allows is set out in its chapter. Designations and consent history are not open data (see the LIM link-out).";
function overlayHitText(h: OverlayHit): string {
  const parts = [h.type, h.subtype, h.name, h.schedule ? `schedule ${h.schedule}` : null].filter(Boolean) as string[];
  const s = [...new Set(parts)].join(" · ");
  return h.version ? `${s || "overlay"} (${h.version.toLowerCase()}, not operative)` : s;
}
const GEOMAPS_URL = "https://geomapspublic.aucklandcouncil.govt.nz/viewer/index.html";

const TITLE_TYPE_NOTE: Record<string, string> = {
  Freehold: "Fee simple: the owner holds the land and buildings outright.",
  "Cross lease": "Owners jointly own the land and lease their own flat's footprint from each other; changes to the building can need the other lessees' consent.",
  "Unit Title": "Ownership of a unit within a body corporate development, with shared common property and body corporate rules and levies.",
  Leasehold: "The land is leased from a separate owner for a term; ground rent applies and the lease has an expiry.",
};

/**
 * TRI-127 — one live lookup per pin, per endpoint, for the life of the page.
 * The panel remounts when the layout crosses the lg breakpoint (desktop panel
 * ↔ mobile sheet) and every remount used to refire five point lookups, which
 * tripped the public rate limiter and blanked the chips. A module-level memo
 * keyed by URL keeps the promise, so a frame swap repaints from the same
 * answer instead of asking LINZ and the council again.
 */
const memo = new Map<string, Promise<unknown>>();
function cachedFetch<T>(key: string, run: () => Promise<T>): Promise<T> {
  let p = memo.get(key) as Promise<T> | undefined;
  if (!p) {
    p = run().catch((e) => {
      memo.delete(key);
      throw e;
    });
    memo.set(key, p);
  }
  return p;
}
const cachedJson = <T,>(url: string) =>
  cachedFetch<T>(url, () => fetch(url).then((res) => (res.ok ? (res.json() as Promise<T>) : Promise.reject(new Error(String(res.status))))));

const STATUS_WORDS: Record<string, string> = {
  inside: "inside",
  outside: "outside",
  within: "within 20 m",
  clear: "none within 20 m",
  unavailable: "council service unavailable — not checked",
  "not assessed": "not in the assessed area",
  pending: "checking… (slow council layer)",
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
    cachedFetch<CommuteResponse | null>(`commute:${key}`, () =>
      fetch("/api/commute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ origin: { lng: pin.lng, lat: pin.lat }, destination: { lng, lat }, mode: "driving-car" }),
      }).then((res) => (res.ok ? (res.json() as Promise<CommuteResponse>) : null)),
    )
      .then((r) => {
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

function CopyAddress({ label }: { label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-testid="copy-address"
      className="rounded border border-hairline px-1.5 py-0.5 font-mono text-[10px] font-normal normal-case tracking-normal text-ink/70 hover:bg-canvas"
      onClick={() => {
        navigator.clipboard?.writeText(label).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => setCopied(false),
        );
      }}
    >
      {copied ? "copied" : "copy address"}
    </button>
  );
}

export function AddressFacts({ pin }: { pin: AddressPin }) {
  const anchors = useAnchors();
  const [hz, setHz] = useState<{ key: string; r: PointHazardResponse | null | "error" }>({ key: "", r: null });
  const key = `${pin.lng},${pin.lat}`;

  useEffect(() => {
    let stale = false;
    // TRI-129 — two phases: the twelve fast layers paint at once (the slow
    // shallow-landslide row shows "checking"), then the ~20 s layer fills in.
    cachedJson<PointHazardResponse>(`/api/point-hazards?lng=${pin.lng}&lat=${pin.lat}&mode=fast`)
      .then((r) => {
        if (stale) return;
        setHz({ key, r });
        const merge = (slow: PointHazardResponse | null) =>
          setHz((prev) => {
            if (prev.key !== key || !prev.r || prev.r === "error") return prev;
            const layers = prev.r.layers.map((l) => {
              if (l.status !== "pending") return l;
              return slow?.layers.find((s) => s.key === l.key) ?? { ...l, status: "unavailable", inside: null, detail: null };
            });
            return { key, r: { ...prev.r, layers } };
          });
        cachedJson<PointHazardResponse>(`/api/point-hazards?lng=${pin.lng}&lat=${pin.lat}&mode=slow`)
          .then((slow) => {
            if (!stale) merge(slow);
          })
          .catch(() => {
            if (!stale) merge(null);
          });
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
    cachedJson<PropertyFactsResponse>(`/api/property-facts?lng=${pin.lng}&lat=${pin.lat}`)
      .then((r) => {
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

  // TRI-127 — built form on the unit (LINZ outlines, live).
  const [bf, setBf] = useState<{ key: string; r: BuiltFormResponse | null | "error" }>({ key: "", r: null });
  useEffect(() => {
    let stale = false;
    cachedJson<BuiltFormResponse>(`/api/built-form?lng=${pin.lng}&lat=${pin.lat}`)
      .then((r) => {
        if (!stale) setBf({ key, r });
      })
      .catch(() => {
        if (!stale) setBf({ key, r: "error" });
      });
    return () => {
      stale = true;
    };
  }, [key, pin.lng, pin.lat]);
  const built = bf.key === key ? bf.r : null;

  // TRI-128 — plan overlays at the point.
  const [ov, setOv] = useState<{ key: string; r: OverlaysResponse | null | "error" }>({ key: "", r: null });
  useEffect(() => {
    let stale = false;
    cachedJson<OverlaysResponse>(`/api/point-overlays?lng=${pin.lng}&lat=${pin.lat}`)
      .then((r) => {
        if (!stale) setOv({ key, r });
      })
      .catch(() => {
        if (!stale) setOv({ key, r: "error" });
      });
    return () => {
      stale = true;
    };
  }, [key, pin.lng, pin.lat]);
  const overlays = ov.key === key ? ov.r : null;
  const imageryCaption = built && built !== "error" && built.imagery
    ? `LINZ aerial basemap · ${built.imagery.title} · CC BY 4.0`
    : "LINZ aerial basemap · CC BY 4.0 · imagery date not reported for this point";

  return (
    <section data-testid="address-facts" className="rounded-md border border-hairline bg-canvas/60 p-3">
      <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-ink/60">
        This property
        <span className="ml-1.5 font-mono text-[10px] font-normal normal-case tracking-normal text-ink/40">public records &amp; point checks · not a property assessment</span>
      </h3>

      <h4 data-testid="epistemic-records" className="mt-2 border-t border-hairline pt-2 font-display text-[11px] font-semibold uppercase tracking-wider text-ink/70">
        Public records about the land
      </h4>
      <h5 className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-ink/45">Title &amp; land — LINZ public records</h5>
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

      <h5 className="mt-2 text-[11px] font-medium uppercase tracking-wider text-ink/45">Built form — LINZ building outlines</h5>
      {built === null && <p className="py-1 text-xs text-ink/50">Reading the LINZ building outlines…</p>}
      {(built === "error" || (built && built.unavailable)) && (
        <p className="py-1 text-xs text-ink/60" data-testid="built-form-unavailable">
          LINZ could not be reached — building outlines were not checked.
        </p>
      )}
      {built && built !== "error" && !built.unavailable && built.none && (
        <p className="py-1 text-xs text-ink/60" data-testid="built-form-none">
          No rating unit at this point in LINZ&apos;s records, so there is nothing to measure outlines against.
        </p>
      )}
      {built && built !== "error" && !built.unavailable && !built.none && (
        <div data-testid="built-form" className="flex flex-wrap items-start gap-3">
          <div className="min-w-[180px] flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-ink/80">Buildings on the section</span>
              <span className="font-mono text-sm font-medium text-ink" data-testid="building-count">{built.building_count}</span>
            </div>
            {built.footprint_m2 != null && (
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-sm text-ink/80">Roof footprint</span>
                <span className="font-mono text-sm font-medium text-ink">{built.footprint_m2.toLocaleString()} m²</span>
              </div>
            )}
            {built.site_coverage_pct != null && (
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-sm text-ink/80">Site coverage</span>
                <span className="font-mono text-sm font-medium text-ink" data-testid="site-coverage">{built.site_coverage_pct}%</span>
              </div>
            )}
            {/* LINZ tags most houses "Unknown"; only a real use or name is worth a line. */}
            {built.outlines.some((o) => o.name || (o.use && o.use !== "Unknown")) && (
              <p className="mt-1 text-[11px] leading-snug text-ink/60">
                {built.outlines
                  .filter((o) => o.name || (o.use && o.use !== "Unknown"))
                  .map((o) => [o.name, o.use !== "Unknown" ? o.use : null].filter(Boolean).join(" · "))
                  .join("; ")}
              </p>
            )}
            <p className="mt-1 text-[10px] leading-snug text-ink/50">
              {BUILT_FORM_NOTE}
              {built.outlines_captured ? ` Outlines captured ${built.outlines_captured}.` : ""}
            </p>
            <div className="mt-1 flex justify-end">
              <Provenance source="LINZ Building Outlines" asOf={built.retrieved_at.slice(0, 10)} confidence="medium" />
            </div>
          </div>
          <div>
            <AerialThumb lng={pin.lng} lat={pin.lat} caption={imageryCaption} />
            <a
              href={GEOMAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-block font-mono text-[10px] text-accent underline-offset-2 hover:underline"
            >
              Auckland Council GeoMaps ↗
            </a>
          </div>
        </div>
      )}

      <h4 data-testid="epistemic-plan" className="mt-3 border-t border-hairline pt-2 font-display text-[11px] font-semibold uppercase tracking-wider text-ink/70">
        Council plan records at this point
      </h4>
      <h5 className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-ink/45">Plan overlays — Auckland Unitary Plan</h5>
      {overlays === null && <p className="py-1 text-xs text-ink/50">Checking the Unitary Plan overlays…</p>}
      {overlays === "error" && (
        <p className="py-1 text-xs text-ink/60">The council plan services could not be reached — no overlay was checked.</p>
      )}
      {overlays && overlays !== "error" && (
        <div data-testid="plan-overlays">
          <ul className="divide-y divide-hairline/60">
            {overlays.layers.map((l) => (
              <li key={l.key} className="py-1.5" data-testid="overlay-row">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-ink/80">
                    {l.label}
                    <span className="ml-1 font-mono text-[10px] text-ink/45">{l.chapter}</span>
                  </span>
                  <span className={`shrink-0 font-mono text-sm font-medium ${l.status === "unavailable" ? "text-ink/45" : "text-ink"}`}>
                    {OVERLAY_STATUS[l.status] ?? l.status}
                  </span>
                </div>
                {l.hits.length > 0 && (
                  <ul className="mt-0.5">
                    {l.hits.map((h, i) => (
                      <li key={i} className="text-[11px] leading-snug text-ink/65">
                        {overlayHitText(h)}
                        <a
                          href={h.document_url ?? AUP_HOME}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1.5 font-mono text-[10px] text-accent underline-offset-2 hover:underline"
                        >
                          {h.document_url ? "chapter ↗" : "AUP ↗"}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] leading-snug text-ink/50">{OVERLAY_NOTE}</p>
          <div className="mt-1 flex justify-end">
            <Provenance source="Auckland Unitary Plan overlays · Auckland Council" asOf={overlays.updated ?? overlays.retrieved_at.slice(0, 10)} confidence="high" />
          </div>
        </div>
      )}

      <h4 data-testid="epistemic-models" className="mt-3 border-t border-hairline pt-2 font-display text-[11px] font-semibold uppercase tracking-wider text-ink/70">
        Area-level models at this point
      </h4>
      <p className="mt-0.5 text-[10px] leading-snug text-ink/50">{HAZARD_CAVEAT}</p>
      <h5 className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-ink/45">Council hazard layers at this point</h5>
      {hazards === null && <p className="py-1 text-xs text-ink/50">Checking the council layers…</p>}
      {hazards === "error" && (
        <p className="py-1 text-xs text-ink/60">The council hazard services could not be reached — nothing was checked.</p>
      )}
      {hazards && hazards !== "error" && (
        <>
          <ul className="divide-y divide-hairline/60">
            {hazards.layers.map((l) => (
              <li key={l.key} className="py-1.5" data-testid="point-hazard">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-ink/80">
                    {l.label}
                    <span className="ml-1 font-mono text-[10px] text-ink/45" title={l.edited ? `council layer last edited ${l.edited}` : undefined}>
                      {l.vintage} layer
                    </span>
                  </span>
                  <span className={`shrink-0 font-mono text-sm font-medium ${l.status === "unavailable" ? "text-ink/45" : "text-ink"}`}>
                    {STATUS_WORDS[l.status] ?? l.status}
                  </span>
                </div>
                {l.detail && <p className="mt-0.5 text-[10px] leading-snug text-ink/55" data-testid="point-hazard-detail">{l.detail}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] leading-snug text-ink/50">{hazards.caveat || HAZARD_CAVEAT}</p>
          <p className="mt-1 text-[10px] leading-snug text-ink/50" data-testid="hazard-map-links">
            {HAIL_NOTE}{" "}
            <a href={FLOOD_VIEWER_URL} target="_blank" rel="noopener noreferrer" className="font-mono text-accent underline-offset-2 hover:underline">
              Flood Viewer ↗
            </a>
            {" · "}
            <a href={GEOMAPS_URL} target="_blank" rel="noopener noreferrer" className="font-mono text-accent underline-offset-2 hover:underline">
              GeoMaps ↗
            </a>
          </p>
          <div className="mt-1 flex justify-end">
            <Provenance source={hazards.source} asOf={hazards.retrieved_at.slice(0, 10)} confidence="medium" />
          </div>
        </>
      )}

      <h5 className="mt-3 text-[11px] font-medium uppercase tracking-wider text-ink/45">
        Drive times from this address
        <span className="ml-1.5 font-mono text-[10px] font-normal normal-case tracking-normal text-ink/40">typical · no live traffic</span>
      </h5>
      <div className="divide-y divide-hairline/60">
        {FIXED_DESTINATIONS.map((d) => (
          <DriveFromPin key={d.id} pin={pin} label={d.label} lng={d.lng} lat={d.lat} />
        ))}
        {anchors.slice(0, AUTO_ROUTED_ANCHORS).map((a) => (
          <DriveFromPin key={a.id} pin={pin} label={a.label.toLowerCase()} lng={a.lng} lat={a.lat} />
        ))}
      </div>

      {/* TRI-132 — what the app deliberately does not hold, and where it is.
          None of these targets accepts an address in the URL (tested
          2026-09-28), so the block offers a copy button instead of a fake deep
          link. Nothing here is fetched, cached or proxied. */}
      <h4 data-testid="epistemic-notheld" className="mt-3 border-t border-hairline pt-2 font-display text-[11px] font-semibold uppercase tracking-wider text-ink/70">
        Not held by this app
      </h4>
      <h5 className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px] font-medium uppercase tracking-wider text-ink/45">
        <span>
          Also check
          <span className="ml-1.5 font-mono text-[10px] font-normal normal-case tracking-normal text-ink/40">where each is published, and why it is not here</span>
        </span>
        <CopyAddress label={pin.label} />
      </h5>
      <ul className="divide-y divide-hairline/60" data-testid="link-outs">
        {LINK_OUTS.map((l) => (
          <li key={l.key} className="py-1.5" data-testid="link-out">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-sm text-ink/80">{l.what}</span>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] text-accent underline-offset-2 hover:underline"
              >
                {l.where} ↗
              </a>
            </div>
            <p className="mt-0.5 text-[10px] leading-snug text-ink/50">{l.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
