"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type {
  Map as MapLibreMap,
  Popup as MapLibrePopup,
  StyleSpecification,
  ExpressionSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useWorkspace } from "@/lib/workspace";
import { fetchMetricDefs, fetchMetricShade, type MetricDef } from "@/lib/suburb-data";

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

async function buildStyle(): Promise<StyleSpecification> {
  if (LINZ_KEY) {
    try {
      const res = await fetch(LINZ_STYLE);
      if (res.ok) {
        const base = (await res.json()) as StyleSpecification;
        base.sources = { ...base.sources, sa2: SA2_SOURCE };
        base.layers = [...base.layers, ...overlayLayers()];
        return base;
      }
    } catch {
      // fall through to the keyless style
    }
  }
  return {
    version: 8,
    sources: { sa2: SA2_SOURCE },
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
  values: Map<string, number>;
  breaks: number[]; // quintile boundaries, length 6 (min..max)
}

function applyThemePaint(map: MapLibreMap, dark: boolean) {
  if (map.getLayer("background")) {
    map.setPaintProperty("background", "background-color", token("--canvas", dark ? "#0e1822" : "#f4f6f5"));
  }
  if (map.getLayer("dim-veil")) {
    // v2 tuning: neutral hue, far lighter than the v1 0.72 — basemap stays legible.
    map.setPaintProperty("dim-veil", "background-opacity", dark ? 0.42 : 0);
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
  for (const [sa2, v] of shade.values) expr.push(sa2, colorFor(v));
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
  const { selected, select } = useWorkspace();
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  }, [select]);

  const [defs, setDefs] = useState<MetricDef[]>([]);
  const [shadeKey, setShadeKey] = useState<string>("");
  const [legend, setLegend] = useState<{ label: string; min: string; max: string } | null>(null);

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
              : `<div class="mc-pop-sub">${shade.def.label}: <strong>${v.toLocaleString()}</strong>${shade.def.unit ? ` ${shade.def.unit}` : ""}</div>`;
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
        values: new Map(rows.map((r) => [r.sa2, r.value])),
        breaks: [sorted[0], q(0.2), q(0.4), q(0.6), q(0.8), sorted[sorted.length - 1]],
      };
      shadeRef.current = shade;
      setLegend({
        label: def.label,
        min: sorted[0].toLocaleString(),
        max: sorted[sorted.length - 1].toLocaleString(),
      });
      if (mapRef.current) applyShadePaint(mapRef.current, shade);
    },
    [defs],
  );

  const [r, g, b] = typeof window !== "undefined" ? harbourRgb() : [14, 110, 115];

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" aria-label="Auckland suburb map" />

      {/* Shade picker */}
      <div className="absolute right-2 top-2 z-10">
        <select
          value={shadeKey}
          onChange={(e) => changeShade(e.target.value)}
          aria-label="Shade map by metric"
          className="h-8 rounded-md border border-hairline bg-surface px-2 text-xs text-ink shadow-sm focus:border-harbour focus:outline-none"
        >
          <option value="">No shading</option>
          {defs.map((d) => (
            <option key={d.metric_key} value={d.metric_key}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      {/* Legend */}
      {legend && (
        <div className="absolute bottom-8 left-2 z-10 rounded-md border border-hairline bg-surface/95 px-2.5 py-1.5 shadow-sm">
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
        </div>
      )}
    </div>
  );
}
