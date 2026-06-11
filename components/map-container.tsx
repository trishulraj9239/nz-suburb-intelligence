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
const LINZ_TILES = `https://basemaps.linz.govt.nz/v1/tiles/topolite/WebMercatorQuad/{z}/{x}/{y}.webp?api=${LINZ_KEY}`;
const LINZ_ATTRIBUTION =
  '<a href="https://www.linz.govt.nz/" target="_blank" rel="noopener">© LINZ CC BY 4.0</a> · boundaries <a href="https://www.stats.govt.nz/" target="_blank" rel="noopener">Stats NZ</a>';

function token(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

function buildStyle(): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    sources: {
      sa2: { type: "geojson", data: "/geo/auckland-sa2.geojson" },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": token("--canvas", "#f4f6f5") },
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
    ],
  };

  if (LINZ_KEY) {
    style.sources.linz = {
      type: "raster",
      tiles: [LINZ_TILES],
      tileSize: 256,
      attribution: LINZ_ATTRIBUTION,
      maxzoom: 19,
    };
    // Basemap slots between the background and the SA2 overlay.
    style.layers.splice(1, 0, {
      id: "linz-basemap",
      type: "raster",
      source: "linz",
      paint: {},
    });
  }

  return style;
}

// Dark mode: dim + desaturate the light tiles (no official dark LINZ style).
function applyThemePaint(map: MapLibreMap, dark: boolean) {
  if (map.getLayer("background")) {
    map.setPaintProperty("background", "background-color", token("--canvas", dark ? "#0e1822" : "#f4f6f5"));
  }
  if (map.getLayer("linz-basemap")) {
    map.setPaintProperty("linz-basemap", "raster-brightness-max", dark ? 0.4 : 1);
    map.setPaintProperty("linz-basemap", "raster-brightness-min", dark ? 0.05 : 0);
    map.setPaintProperty("linz-basemap", "raster-saturation", dark ? -0.6 : 0);
    map.setPaintProperty("linz-basemap", "raster-contrast", dark ? 0.15 : 0);
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
    map.setPaintProperty("sa2-line", "line-opacity", dark ? 0.8 : 0.55);
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
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !ref.current || mapRef.current) return;

      const map = new maplibregl.Map({
        container: ref.current,
        style: buildStyle(),
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
