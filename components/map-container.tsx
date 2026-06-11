"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Read the active --canvas design token so the blank map matches the theme
// (no hardcoded hex). Falls back to the light canvas value before paint.
function canvasColor() {
  if (typeof window === "undefined") return "#f4f6f5";
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--canvas")
      .trim() || "#f4f6f5"
  );
}

// Auckland CBD — the M1 coverage region (centroid only; no overlay this session).
const AUCKLAND: [number, number] = [174.7633, -36.8485];

/**
 * Empty MapLibre GL map. This session renders the container ONLY — no tiles,
 * sources, or overlays (those land in M4). The style is a single background
 * layer painted with the active canvas token, kept in sync with the theme.
 */
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

      mapRef.current = new maplibregl.Map({
        container: ref.current,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": canvasColor() },
            },
          ],
        },
        center: AUCKLAND,
        zoom: 10,
        attributionControl: false,
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Repaint the blank canvas when the theme changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer("background")) {
        map.setPaintProperty("background", "background-color", canvasColor());
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [resolvedTheme]);

  return <div ref={ref} className="h-full w-full" aria-label="Suburb map" />;
}
