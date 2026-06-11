"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Auckland map: LINZ Basemaps raster tiles (decision #2: LINZ Basemaps over
 * LDS WMTS — purpose-built tile CDN, simple XYZ, free tier) under the SA2
 * polygon overlay from public/geo/auckland-sa2.geojson (TRI-16 output).
 *
 * Theming: there is no official dark LINZ style, so dark mode dims/desaturates
 * the same tiles via raster paint properties over the dark canvas — polygons
 * read the design tokens at swap time, so they follow the theme exactly.
 * Without NEXT_PUBLIC_LINZ_API_KEY the map degrades to the blank-canvas shell
 * (polygons still render) rather than erroring.
 */

const AUCKLAND_CENTER: [number, number] = [174.7633, -36.8485];
const LINZ_KEY = process.env.NEXT_PUBLIC_LINZ_API_KEY;
// topolite vector style — LINZ's clean cartographic base, built for data-over-map UIs.
const LINZ_STYLE = `https://basemaps.linz.govt.nz/v1/styles/topolite.json?api=${LINZ_KEY}`;
const LINZ_ATTRIBUTION =
  '<a href="https://www.linz.govt.nz/" target="_blank" rel="noopener">© LINZ CC BY 4.0</a> · boundaries <a href="https://www.stats.govt.nz/" target="_blank" rel="noopener">Stats NZ</a>';

function token(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

// Our overlay stack, appended above whatever base style is in use:
// a dim veil (dark mode lowers the basemap without needing a dark LINZ style)
// then the SA2 polygons in the harbour token.
function overlayLayers(): StyleSpecification["layers"] {
  return [
    {
      id: "dim-veil",
      type: "background",
      paint: { "background-color": "#0e1822", "background-opacity": 0 },
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
  ];
}

const SA2_SOURCE = {
  type: "geojson",
  data: "/geo/auckland-sa2.geojson",
  attribution: LINZ_ATTRIBUTION,
} as const;

/**
 * Base = LINZ topolite vector style (fetched, then our overlay merged in).
 * Without a key, or if the fetch fails, fall back to polygons over the token
 * canvas so the shell never breaks on missing config.
 */
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

function applyThemePaint(map: MapLibreMap, dark: boolean) {
  if (map.getLayer("background")) {
    map.setPaintProperty("background", "background-color", token("--canvas", dark ? "#0e1822" : "#f4f6f5"));
  }
  if (map.getLayer("dim-veil")) {
    map.setPaintProperty("dim-veil", "background-opacity", dark ? 0.72 : 0);
  }
  for (const [layer, prop] of [
    ["sa2-fill", "fill-color"],
    ["sa2-line", "line-color"],
  ] as const) {
    if (map.getLayer(layer)) {
      map.setPaintProperty(layer, prop, token("--harbour", "#0e6e73"));
    }
  }
  if (map.getLayer("sa2-line")) {
    map.setPaintProperty("sa2-line", "line-opacity", dark ? 0.85 : 0.55);
  }
}

// The live theme as next-themes wrote it to <html data-theme> — readable at
// any time without touching React state from map callbacks.
const isDarkNow = () =>
  typeof document !== "undefined" &&
  document.documentElement.getAttribute("data-theme") === "dark";

export function MapContainer() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const { resolvedTheme } = useTheme();

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
      map.once("load", () => applyThemePaint(map, isDarkNow()));
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const dark = resolvedTheme === "dark";
    if (map.isStyleLoaded()) applyThemePaint(map, dark);
    else map.once("load", () => applyThemePaint(map, dark));
  }, [resolvedTheme]);

  return <div ref={ref} className="h-full w-full" aria-label="Auckland suburb map" />;
}
