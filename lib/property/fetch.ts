"use client";

import { useEffect, useState } from "react";
import type { AddressPin } from "@/lib/workspace";

/**
 * TRI-150 — response types and the one-lookup-per-pin memo behind the
 * "This property" panel, lifted out of the 825-line component so each group
 * is a small file over a typed hook.
 */

export interface PointHazardLayer {
  key: string;
  label: string;
  vintage: string;
  edited?: string | null;
  status: string;
  inside: boolean | null;
  /** TRI-129 — the record's own detail on a hit (depth, model, class wording). */
  detail?: string | null;
}
export interface PointHazardResponse {
  layers: PointHazardLayer[];
  caveat: string;
  source: string;
  retrieved_at: string;
  /** TRI-156 — what the layers were tested against. */
  geometry?: "address point" | "rating unit";
  /** true = a LINZ rating unit was found and tested; false = none at this point; null = point test. */
  unit_found?: boolean | null;
}
export interface CommuteResponse {
  duration_s: number | null;
  distance_m: number;
  fallback: boolean;
  source: { name: string };
  retrieved_at: string;
}
// TRI-126 — public land records at the point (LINZ, live).
export interface PropertyUnit {
  source_id: string;
  title_type: string | null;
  area_m2: number | null;
  legal_description: string | null;
  valuation_reference: string | null;
  title_nos: string[];
}
export interface PropertyTitle {
  title_no: string;
  type: string | null;
  status: string | null;
  issue_date: string | null;
  estate_description: string | null;
}
export interface PropertyFactsResponse {
  units: PropertyUnit[];
  titles: PropertyTitle[];
  source: string;
  licence: string;
  retrieved_at: string;
  unavailable?: string;
}
// TRI-127 — building outlines on the rating unit (LINZ, live).
export interface BuiltFormResponse {
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
// TRI-130 — this block (SA1) beside this suburb (SA2).
export interface BlockStatsResponse {
  none?: boolean;
  sa1_code: string | null;
  population: number | null;
  median_age: number | null;
  renting_pct: number | null;
  owned_pct: number | null;
  one_person_household_pct: number | null;
  median_household_income: number | null;
  separate_house_pct: number | null;
  avg_bedrooms: number | null;
  overseas_born_pct: number | null;
  ethnicity: { label: string; pct: number | null }[];
  nzdep_decile: number | null;
  suppressed: string[];
  source: string;
  nzdep_source: string;
  retrieved_at: string;
  unavailable?: string;
}
/** The suburb-level figures the profile already holds, for the side-by-side. */
export interface SuburbStats {
  name: string;
  population: number | null;
  median_age: number | null;
  renting_pct: number | null;
  median_household_income: number | null;
  separate_house_pct: number | null;
  nzdep_decile: number | null;
  ethnicity: Record<string, number | null>;
}
// TRI-131 — nearest park / station / schools, straight-line from the pin.
export interface NearbyPlace {
  name: string;
  distance_m: number;
  detail: string | null;
}
export interface NearbyResponse {
  park: NearbyPlace | null;
  station: NearbyPlace | null;
  schools: { primary: NearbyPlace | null; intermediate: NearbyPlace | null; secondary: NearbyPlace | null };
  unavailable: string[];
  note: string;
  source: string;
  retrieved_at: string;
}
// TRI-128 — Unitary Plan overlays at the point (council services, live).
export interface OverlayHit {
  name: string | null;
  type: string | null;
  subtype: string | null;
  schedule: string | null;
  version: string | null;
  document_url: string | null;
}
export interface OverlayLayer {
  key: string;
  label: string;
  chapter: string;
  kind: "polygon" | "point";
  status: string;
  inside: boolean | null;
  hits: OverlayHit[];
}
export interface OverlaysResponse {
  layers: OverlayLayer[];
  source: string;
  updated: string | null;
  retrieved_at: string;
}

export const fmtDistance = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
export const fmtInt = (v: number | null) => (v === null ? null : v.toLocaleString());
export const fmtPct = (v: number | null) => (v === null ? null : `${v}%`);
export const fmtMoney = (v: number | null) => (v === null ? null : `${Math.round(v).toLocaleString()}`);
export const fmtDec = (v: number | null) => (v === null ? null : String(v));
export const fmtNum = (v: number | null, d = 1) => (v === null ? null : v.toFixed(d));

export function overlayHitText(h: OverlayHit): string {
  const parts = [h.type, h.subtype, h.name, h.schedule ? `schedule ${h.schedule}` : null].filter(Boolean) as string[];
  const s = [...new Set(parts)].join(" · ");
  return h.version ? `${s || "overlay"} (${h.version.toLowerCase()}, not operative)` : s;
}

/**
 * TRI-127 — one live lookup per pin, per endpoint, for the life of the page.
 * The panel remounts when the layout crosses the lg breakpoint (desktop panel
 * ↔ mobile sheet) and every remount used to refire five point lookups, which
 * tripped the public rate limiter and blanked the chips. A module-level memo
 * keyed by URL keeps the promise, so a frame swap repaints from the same
 * answer instead of asking LINZ and the council again.
 */
const memo = new Map<string, Promise<unknown>>();
export function cachedFetch<T>(key: string, run: () => Promise<T>): Promise<T> {
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
export const cachedJson = <T,>(url: string) =>
  cachedFetch<T>(url, () => fetch(url).then((res) => (res.ok ? (res.json() as Promise<T>) : Promise.reject(new Error(String(res.status))))));

/** `null` = loading, `"error"` = the call failed, else the response. */
export type Lookup<T> = T | null | "error";

/** One point lookup for a pin, keyed so a new pin never shows the old answer. */
export function usePointLookup<T>(pin: AddressPin, path: string, extra = ""): Lookup<T> {
  const key = `${pin.lng},${pin.lat}`;
  const [state, setState] = useState<{ key: string; r: Lookup<T> }>({ key: "", r: null });
  useEffect(() => {
    let stale = false;
    cachedJson<T>(`${path}?lng=${pin.lng}&lat=${pin.lat}${extra}`)
      .then((r) => {
        if (!stale) setState({ key, r });
      })
      .catch(() => {
        if (!stale) setState({ key, r: "error" });
      });
    return () => {
      stale = true;
    };
  }, [key, path, extra, pin.lng, pin.lat]);
  return state.key === key ? state.r : null;
}

/** TRI-156 — the same layers tested against the whole rating unit (fast layers only; one call). */
export function usePointHazardsUnit(pin: AddressPin): Lookup<PointHazardResponse> {
  return usePointLookup<PointHazardResponse>(pin, "/api/point-hazards", "&mode=fast&geometry=unit");
}

/**
 * TRI-129 — two phases: the twelve fast layers paint at once (the slow
 * shallow-landslide row shows "checking"), then the ~20 s layer fills in.
 */
export function usePointHazards(pin: AddressPin): Lookup<PointHazardResponse> {
  const key = `${pin.lng},${pin.lat}`;
  const [hz, setHz] = useState<{ key: string; r: Lookup<PointHazardResponse> }>({ key: "", r: null });
  useEffect(() => {
    let stale = false;
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
  return hz.key === key ? hz.r : null;
}

/** A drive from the pin to one destination (TRI-123), memoised like the point lookups. */
export function useDriveFromPin(pin: AddressPin, lng: number, lat: number): CommuteResponse | null | undefined {
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
  return state?.key === key ? state.r : undefined;
}
