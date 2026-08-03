"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type {
  Map as MapLibreMap,
  Popup as MapLibrePopup,
  StyleSpecification,
  ExpressionSpecification,
  GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useWorkspace } from "@/lib/workspace";
import { usePersona } from "@/lib/preferences";
import { personaConfig } from "@/lib/persona";
import {
  fetchMetricDefs,
  fetchMetricShade,
  type MetricDef,
  type ShadeRow,
} from "@/lib/suburb-data";
import { confidenceLabel, shortSource } from "./provenance";

/**
 * Auckland map (TRI-23 base + TRI-35 v2): LINZ topolite vector base, SA2
 * overlay, choropleth shading by any scalar metric (quantile ramp on the
 * harbour token — single-hue sequential, colourblind-safe, verdict-free),
 * hover tooltips, fly-to on selection. Dark mode dims the basemap with a
 * neutral veil (tuned down from v1 — was too dark/tinted).
 */

const AUCKLAND_CENTER: [number, number] = [174.7633, -36.8485];
const LINZ_KEY = process.env.NEXT_PUBLIC_LINZ_API_KEY;
const LINZ_STYLE = `https://basemaps.linz.govt.nz/v1/styles/topolite.json?api=${LINZ_KEY}`;
const LINZ_ATTRIBUTION =
  '<a href="https://www.linz.govt.nz/" target="_blank" rel="noopener">© LINZ CC BY 4.0</a> · boundaries <a href="https://www.stats.govt.nz/" target="_blank" rel="noopener">Stats NZ</a>';

const RAMP_ALPHAS = [0.14, 0.32, 0.5, 0.68, 0.86];

function token(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

function harbourRgb(): [number, number, number] {
  const hex = token("--harbour", "#0e6e73").replace("#", "");
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

const isDarkNow = () =>
  typeof document !== "undefined" &&
  document.documentElement.getAttribute("data-theme") === "dark";

// Feature geometry cache for fly-to bounds (same file the map renders).
let geoCache: Promise<GeoJSON.FeatureCollection> | null = null;
function loadGeo(): Promise<GeoJSON.FeatureCollection> {
  geoCache ??= fetch("/geo/auckland-sa2.geojson").then((r) => r.json());
  return geoCache;
}
// Coverage extent (precomputed bbox in the outline file) for the default /
// reset view. Cached — fetched once.
type LngLatBounds = [[number, number], [number, number]];
let coverageBoundsCache: Promise<LngLatBounds | null> | null = null;
function loadCoverageBounds(): Promise<LngLatBounds | null> {
  coverageBoundsCache ??= fetch("/geo/auckland-coverage.geojson")
    .then((r) => r.json())
    .then((j: { bbox?: [number, number, number, number] }) =>
      j.bbox ? ([[j.bbox[0], j.bbox[1]], [j.bbox[2], j.bbox[3]]] as LngLatBounds) : null,
    )
    .catch(() => null);
  return coverageBoundsCache;
}

// Padding so the framed region sits in the *visible* map: on phones the bottom
// sheet overlays the lower map, so bias the fit upward; on desktop the panel is
// a separate column, so even padding is enough.
function fitPadding(map: MapLibreMap) {
  const h = map.getContainer().clientHeight;
  const mobile = typeof window !== "undefined" && window.innerWidth < 1024;
  return { top: 28, left: 24, right: 24, bottom: mobile ? Math.round(h * 0.42) : 28 };
}

function fitCoverage(map: MapLibreMap, animate: boolean) {
  loadCoverageBounds().then((b) => {
    if (b) map.fitBounds(b, { padding: fitPadding(map), duration: animate ? 700 : 0 });
  });
}

function boundsOf(f: GeoJSON.Feature): [[number, number], [number, number]] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === "number") {
      const [x, y] = c as [number, number];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    } else for (const child of c as unknown[]) walk(child);
  };
  walk((f.geometry as GeoJSON.Polygon).coordinates);
  return [[minX, minY], [maxX, maxY]];
}

function overlayLayers(): StyleSpecification["layers"] {
  return [
    {
      id: "dim-veil",
      type: "background",
      paint: { "background-color": "#0a0e12", "background-opacity": 0 },
    },
    {
      id: "sa2-fill",
      type: "fill",
      source: "sa2",
      paint: { "fill-color": token("--harbour", "#0e6e73"), "fill-opacity": 0.04 },
    },
    // Hazards sit above the choropleth fill but below suburb borders and
    // selection, so boundaries stay legible with overlays on.
    ...hazardLayerSpecs(),
    {
      id: "sa2-line",
      type: "line",
      source: "sa2",
      paint: {
        "line-color": token("--harbour", "#0e6e73"),
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 13, 1.4],
        "line-opacity": 0.55,
      },
    },
    {
      // Outer frame of the data coverage (Auckland-only for now) — a dark,
      // theme-aware boundary so the limits of the dataset read at a glance.
      id: "coverage-line",
      type: "line",
      source: "coverage",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": token("--ink", "#13212e"),
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1.2, 11, 2.2, 14, 3],
        "line-opacity": 0.85,
      },
    },
    {
      id: "sa2-selected-fill",
      type: "fill",
      source: "sa2",
      filter: ["==", ["get", "SA22023_V1_00"], ""],
      paint: { "fill-color": token("--harbour", "#0e6e73"), "fill-opacity": 0.18 },
    },
    {
      id: "sa2-selected-line",
      type: "line",
      source: "sa2",
      filter: ["==", ["get", "SA22023_V1_00"], ""],
      paint: { "line-color": token("--harbour", "#0e6e73"), "line-width": 2.5 },
    },
  ];
}

const SA2_SOURCE = {
  type: "geojson",
  data: "/geo/auckland-sa2.geojson",
  attribution: LINZ_ATTRIBUTION,
} as const;

// Pre-dissolved coverage boundary (scripts/build-coverage-outline.mjs).
const COVERAGE_SOURCE = {
  type: "geojson",
  data: "/geo/auckland-coverage.geojson",
} as const;

// Hazard overlays (TRI-69) — simplified geometry in public/geo/hazards/
// (scripts/etl/tri-69-hazard-overlays.mjs). Sources start as EMPTY feature
// collections and layers as visibility:'none' (all layers exist at style
// build time); the file is only fetched on first toggle via setData(url).
// One flat hue per layer — sequential, no red-means-bad, distinct from the
// harbour choropleth ramp. Liquefaction shows only the elevated class
// ("damage possible"); the full 5-class breakdown lives in the profile.
const HAZARD_LAYERS = [
  { key: "flood", label: "Flood plains (1% AEP)", vintage: "2026", color: "#2f6db6" },
  { key: "coastal", label: "Coastal inundation (1% AEP)", vintage: "2025", color: "#6d5bb8" },
  { key: "coastal_slr1m", label: "Coastal inundation, +1 m sea level", vintage: "2025", color: "#9b8ed6" },
  { key: "liquefaction", label: "Liquefaction — damage possible", vintage: "2022", color: "#b0803a" },
  { key: "heritage", label: "Heritage overlay", vintage: "2026", color: "#7a5c3e" },
] as const;

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function hazardSources(): Record<string, { type: "geojson"; data: GeoJSON.FeatureCollection }> {
  return Object.fromEntries(
    HAZARD_LAYERS.map((h) => [`hz-${h.key}`, { type: "geojson" as const, data: EMPTY_FC }]),
  );
}

function hazardLayerSpecs(): StyleSpecification["layers"] {
  return HAZARD_LAYERS.flatMap((h) => [
    {
      id: `hz-${h.key}-fill`,
      type: "fill" as const,
      source: `hz-${h.key}`,
      layout: { visibility: "none" as const },
      paint: { "fill-color": h.color, "fill-opacity": 0.32 },
    },
    {
      id: `hz-${h.key}-line`,
      type: "line" as const,
      source: `hz-${h.key}`,
      layout: { visibility: "none" as const },
      paint: { "line-color": h.color, "line-width": 0.6, "line-opacity": 0.5 },
    },
  ]);
}

async function buildStyle(): Promise<StyleSpecification> {
  if (LINZ_KEY) {
    try {
      const res = await fetch(LINZ_STYLE);
      if (res.ok) {
        const base = (await res.json()) as StyleSpecification;
        base.sources = { ...base.sources, sa2: SA2_SOURCE, coverage: COVERAGE_SOURCE, ...hazardSources() };
        base.layers = [...base.layers, ...overlayLayers()];
        return base;
      }
    } catch {
      // fall through to the keyless style
    }
  }
  return {
    version: 8,
    sources: { sa2: SA2_SOURCE, coverage: COVERAGE_SOURCE, ...hazardSources() },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": token("--canvas", "#f4f6f5") },
      },
      ...overlayLayers(),
    ],
  };
}

interface ShadeState {
  def: MetricDef;
  values: Map<string, ShadeRow>;
  breaks: number[]; // quintile boundaries, length 6 (min..max)
}

function applyThemePaint(map: MapLibreMap, dark: boolean) {
  if (map.getLayer("background")) {
    map.setPaintProperty("background", "background-color", token("--canvas", dark ? "#0e1822" : "#f4f6f5"));
  }
  if (map.getLayer("dim-veil")) {
    // Light veil only — enough to seat the choropleth, but kept low (was 0.42)
    // so SA2 fills, the coverage border, and selection highlights stay legible.
    map.setPaintProperty("dim-veil", "background-opacity", dark ? 0.2 : 0);
  }
  for (const [layer, prop] of [
    ["sa2-line", "line-color"],
    ["sa2-selected-fill", "fill-color"],
    ["sa2-selected-line", "line-color"],
  ] as const) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, prop, token("--harbour", "#0e6e73"));
  }
  if (map.getLayer("sa2-line")) {
    map.setPaintProperty("sa2-line", "line-opacity", dark ? 0.7 : 0.55);
  }
  if (map.getLayer("coverage-line")) {
    map.setPaintProperty("coverage-line", "line-color", token("--ink", dark ? "#e6ecee" : "#13212e"));
  }
  // Hazard overlays: flat hues stay fixed, opacity lifts against the dark
  // basemap veil — without this they wash out after a theme swap.
  for (const h of HAZARD_LAYERS) {
    if (map.getLayer(`hz-${h.key}-fill`)) {
      map.setPaintProperty(`hz-${h.key}-fill`, "fill-opacity", dark ? 0.42 : 0.32);
    }
    if (map.getLayer(`hz-${h.key}-line`)) {
      map.setPaintProperty(`hz-${h.key}-line`, "line-opacity", dark ? 0.65 : 0.5);
    }
  }
}

function applyShadePaint(map: MapLibreMap, shade: ShadeState | null) {
  if (!map.getLayer("sa2-fill")) return;
  if (!shade) {
    map.setPaintProperty("sa2-fill", "fill-color", token("--harbour", "#0e6e73"));
    map.setPaintProperty("sa2-fill", "fill-opacity", 0.04);
    return;
  }
  const [r, g, b] = harbourRgb();
  const colorFor = (v: number) => {
    let cls = 0;
    for (let i = 1; i < 5; i++) if (v >= shade.breaks[i]) cls = i;
    return `rgba(${r},${g},${b},${RAMP_ALPHAS[cls]})`;
  };
  const expr: unknown[] = ["match", ["get", "SA22023_V1_00"]];
  for (const [sa2, v] of shade.values) expr.push(sa2, colorFor(v.value));
  expr.push("rgba(0,0,0,0)"); // no data → unshaded
  map.setPaintProperty("sa2-fill", "fill-color", expr as ExpressionSpecification);
  map.setPaintProperty("sa2-fill", "fill-opacity", 1);
}

export function MapContainer() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<MapLibrePopup | null>(null);
  const shadeRef = useRef<ShadeState | null>(null);
  const skipFlyRef = useRef(false);
  const { resolvedTheme } = useTheme();
  const { selected, select, resetSeq } = useWorkspace();
  const persona = usePersona();
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  }, [select]);

  const [defs, setDefs] = useState<MetricDef[]>([]);
  const [shadeKey, setShadeKey] = useState<string>("");
  const [hazardsOpen, setHazardsOpen] = useState(false);
  const [hazardOn, setHazardOn] = useState<ReadonlySet<string>>(new Set());
  const hazardLoadedRef = useRef<Set<string>>(new Set());

  // Toggle a hazard overlay. First enable lazily points the (empty) source at
  // the static file — setData(url) lets MapLibre fetch it; nothing loads at
  // page-open. Subsequent toggles only flip layer visibility.
  const toggleHazard = useCallback(
    (key: string) => {
      const map = mapRef.current;
      if (!map) return;
      const wasOn = hazardOn.has(key);
      const next = new Set(hazardOn);
      if (wasOn) next.delete(key);
      else next.add(key);
      setHazardOn(next);
      if (!wasOn && !hazardLoadedRef.current.has(key)) {
        hazardLoadedRef.current.add(key);
        (map.getSource(`hz-${key}`) as GeoJSONSource | undefined)?.setData(`/geo/hazards/${key}.geojson`);
      }
      for (const suffix of ["fill", "line"]) {
        const id = `hz-${key}-${suffix}`;
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", wasOn ? "none" : "visible");
      }
    },
    [hazardOn],
  );
  const [legend, setLegend] = useState<{
    label: string;
    min: string;
    max: string;
    source: string;
  } | null>(null);

  useEffect(() => {
    fetchMetricDefs().then(setDefs).catch(() => setDefs([]));
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;

    (async () => {
      const [maplibregl, style] = await Promise.all([
        import("maplibre-gl").then((m) => m.default),
        buildStyle(),
      ]);
      if (cancelled || !ref.current || mapRef.current) return;

      const map = new maplibregl.Map({
        container: ref.current,
        style,
        center: AUCKLAND_CENTER,
        zoom: 9.5,
        minZoom: 7,
        maxZoom: 17,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10,
        maxWidth: "260px",
      });
      map.once("load", () => {
        applyThemePaint(map, isDarkNow());
        applyShadePaint(map, shadeRef.current);
        fitCoverage(map, false); // open framed on the full coverage extent
      });

      map.on("click", "sa2-fill", (e) => {
        const code = e.features?.[0]?.properties?.SA22023_V1_00 as string | undefined;
        if (code) {
          skipFlyRef.current = true; // it's already under the cursor
          selectRef.current(code);
        }
      });
      map.on("mousemove", "sa2-fill", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f || !popupRef.current) return;
        const name = f.properties?.SA22023_V1_00_NAME as string;
        const code = f.properties?.SA22023_V1_00 as string;
        const shade = shadeRef.current;
        let detail = "";
        if (shade) {
          const v = shade.values.get(code);
          detail =
            v === undefined
              ? `<div class="mc-pop-sub">no data</div>`
              : `<div class="mc-pop-sub">${shade.def.label}: <strong>${v.value.toLocaleString()}</strong>${shade.def.unit ? ` ${shade.def.unit}` : ""}</div>` +
                `<div class="mc-pop-src">${shortSource(v.source)} · ${v.asOf.slice(0, 4)} · ${confidenceLabel(v.confidence)}</div>`;
        }
        popupRef.current
          .setLngLat(e.lngLat)
          .setHTML(`<div class="mc-pop-name">${name}</div>${detail}`)
          .addTo(map);
      });
      map.on("mouseleave", "sa2-fill", () => {
        map.getCanvas().style.cursor = "";
        popupRef.current?.remove();
      });

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Theme swap repaints chrome + re-applies the shade ramp in the new hue.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const dark = resolvedTheme === "dark";
    const apply = () => {
      applyThemePaint(map, dark);
      applyShadePaint(map, shadeRef.current);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [resolvedTheme]);

  // Selection highlight + fly-to (skipped when the selection came from a map click).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const filter = ["==", ["get", "SA22023_V1_00"], selected ?? ""] as const;
      for (const layer of ["sa2-selected-fill", "sa2-selected-line"]) {
        if (map.getLayer(layer)) map.setFilter(layer, filter as never);
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);

    if (!selected) return;
    if (skipFlyRef.current) {
      skipFlyRef.current = false;
      return;
    }
    let stale = false;
    loadGeo().then((fc) => {
      if (stale || !mapRef.current) return;
      const f = fc.features.find((x) => x.properties?.SA22023_V1_00 === selected);
      if (f) mapRef.current.fitBounds(boundsOf(f), { padding: 90, maxZoom: 13.5, duration: 900 });
    });
    return () => {
      stale = true;
    };
  }, [selected]);

  // Shade metric change → fetch values, compute quintiles, paint + legend.
  const changeShade = useCallback(
    async (key: string) => {
      setShadeKey(key);
      if (!key) {
        shadeRef.current = null;
        setLegend(null);
        if (mapRef.current) applyShadePaint(mapRef.current, null);
        return;
      }
      const def = defs.find((d) => d.metric_key === key);
      if (!def) return;
      const rows = await fetchMetricShade(key);
      const sorted = rows.map((r) => r.value).sort((a, b) => a - b);
      if (sorted.length < 5) return;
      const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
      const shade: ShadeState = {
        def,
        values: new Map(rows.map((r) => [r.sa2, r])),
        breaks: [sorted[0], q(0.2), q(0.4), q(0.6), q(0.8), sorted[sorted.length - 1]],
      };
      shadeRef.current = shade;
      // One legend entry per source, vintages compressed: two years stay
      // explicit ("Census 2018+2023" — suppression honesty, the shade is
      // latest-per-suburb), three or more become a range ("2020–2026").
      const yearsBySource = new Map<string, Set<string>>();
      for (const r of rows) {
        const s = shortSource(r.source);
        (yearsBySource.get(s) ?? yearsBySource.set(s, new Set()).get(s)!).add(r.asOf.slice(0, 4));
      }
      const sourceLabel = [...yearsBySource.entries()]
        .map(([s, ys]) => {
          const yrs = [...ys].sort();
          return `${s} ${yrs.length > 2 ? `${yrs[0]}–${yrs[yrs.length - 1]}` : yrs.join("+")}`;
        })
        .sort()
        .join(" · ");
      setLegend({
        label: def.label,
        min: sorted[0].toLocaleString(),
        max: sorted[sorted.length - 1].toLocaleString(),
        source: sourceLabel,
      });
      if (mapRef.current) applyShadePaint(mapRef.current, shade);
    },
    [defs],
  );

  const changeShadeRef = useRef(changeShade);
  useEffect(() => {
    changeShadeRef.current = changeShade;
  }, [changeShade]);

  // Persona default shade (TRI-59) — the default state is the active
  // persona's defaultMapMetric when it exists in the registry (a
  // forward-declared Phase 3 key falls back to no shading). Applies on load
  // and on persona switch, but a metric the user picked by hand wins for the
  // rest of the session.
  const userPickedRef = useRef(false);
  const applyPersonaDefault = useCallback(() => {
    const want = personaConfig(persona).defaultMapMetric;
    changeShadeRef.current(defs.some((d) => d.metric_key === want) ? want : "");
  }, [defs, persona]);
  useEffect(() => {
    if (!defs.length || userPickedRef.current) return;
    applyPersonaDefault();
  }, [defs, persona, applyPersonaDefault]);

  // Home reset → ease back to the Auckland overview and the persona default
  // shade (manual pick forgotten — Home means "default state").
  const resetReadyRef = useRef(false);
  useEffect(() => {
    if (!resetReadyRef.current) {
      resetReadyRef.current = true; // skip the initial mount (resetSeq === 0)
      return;
    }
    if (mapRef.current) fitCoverage(mapRef.current, true);
    userPickedRef.current = false;
    applyPersonaDefault();
    // applyPersonaDefault is ref-stable in behaviour; resetSeq is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSeq]);

  const [r, g, b] = typeof window !== "undefined" ? harbourRgb() : [14, 110, 115];

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" aria-label="Auckland suburb map" />

      {/* Shade picker + legend — stacked top-right so the position is identical
          on mobile and web; the legend only appears once a metric is chosen. */}
      <div className="absolute right-2 top-2 z-10 flex max-w-[calc(100%-1rem)] flex-col items-end gap-2">
        <select
          value={shadeKey}
          onChange={(e) => {
            userPickedRef.current = true;
            changeShade(e.target.value);
          }}
          aria-label="Shade map by metric"
          className="h-8 max-w-full rounded-md border border-hairline bg-surface px-2 text-xs text-ink shadow-sm focus:border-harbour focus:outline-none"
        >
          <option value="">No shading</option>
          {defs.map((d) => (
            <option key={d.metric_key} value={d.metric_key}>
              {d.label}
            </option>
          ))}
        </select>

        {/* Hazard layer toggles (TRI-69) — collapsed by default, all layers
            off by default. Exposure is information, never a verdict. */}
        <div className="w-52 max-w-full rounded-md border border-hairline bg-surface/95 shadow-sm">
          <button
            type="button"
            onClick={() => setHazardsOpen((o) => !o)}
            aria-expanded={hazardsOpen}
            className="flex h-8 w-full items-center justify-between px-2.5 text-xs text-ink"
          >
            <span>
              Hazard layers
              {hazardOn.size > 0 && <span className="ml-1 text-ink/45">({hazardOn.size} on)</span>}
            </span>
            <span aria-hidden className="font-mono text-ink/50">{hazardsOpen ? "−" : "+"}</span>
          </button>
          {hazardsOpen && (
            <div className="border-t border-hairline px-2.5 py-1.5">
              {HAZARD_LAYERS.map((h) => (
                <label
                  key={h.key}
                  className="flex cursor-pointer items-center gap-1.5 py-1 text-[11px] leading-tight text-ink/80"
                >
                  <input
                    type="checkbox"
                    checked={hazardOn.has(h.key)}
                    onChange={() => toggleHazard(h.key)}
                  />
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ background: h.color }}
                  />
                  <span>
                    {h.label} <span className="font-mono text-[10px] text-ink/40">{h.vintage}</span>
                  </span>
                </label>
              ))}
              <p className="mt-1.5 border-t border-hairline/60 pt-1.5 text-[9px] leading-snug text-ink/50">
                Area-level model — not a property assessment. Check the council Flood
                Viewer and a LIM report for any specific property.
              </p>
            </div>
          )}
        </div>

        {legend && (
          <div className="rounded-md border border-hairline bg-surface/95 px-2.5 py-1.5 shadow-sm">
            <p className="text-[10px] font-medium text-ink/80">{legend.label}</p>
            <div className="mt-1 flex h-2 w-36 overflow-hidden rounded-sm">
              {RAMP_ALPHAS.map((a) => (
                <span key={a} className="h-full flex-1" style={{ background: `rgba(${r},${g},${b},${a})` }} />
              ))}
            </div>
            <div className="mt-0.5 flex justify-between font-mono text-[9px] text-ink/55">
              <span>{legend.min}</span>
              <span>{legend.max}</span>
            </div>
            <p className="mt-0.5 text-[9px] text-ink/45">quintiles · darker = higher · unshaded = no data</p>
            <p className="mt-0.5 font-mono text-[9px] text-ink/45">{legend.source}</p>
          </div>
        )}
      </div>
    </div>
  );
}
