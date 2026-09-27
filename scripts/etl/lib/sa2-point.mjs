/**
 * Point-in-SA2 lookup over the same polygons the map bundles
 * (public/geo/auckland-sa2.geojson) — the "SA2 join IS the Auckland clip" rule
 * from TRI-44, extracted so incremental loaders (TRI-138) classify points the
 * same way the full load did. Bbox pre-check + ray cast; holes respected;
 * MultiPolygon = any part.
 */

import { readFileSync } from "node:fs";

export function loadSa2Index(path = "public/geo/auckland-sa2.geojson") {
  const geo = JSON.parse(readFileSync(path, "utf8"));
  const polys = geo.features.map((f) => {
    const rings =
      f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const poly of rings)
      for (const ring of poly)
        for (const [x, y] of ring) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
    return { code: String(f.properties.SA22023_V1_00), rings, minX, minY, maxX, maxY };
  });

  function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /** @returns {string|null} SA2-2023 code containing (lng, lat), or null. */
  return function sa2For(x, y) {
    for (const p of polys) {
      if (x < p.minX || x > p.maxX || y < p.minY || y > p.maxY) continue;
      for (const poly of p.rings) {
        if (!inRing(x, y, poly[0])) continue;
        if (poly.slice(1).some((hole) => inRing(x, y, hole))) continue;
        return p.code;
      }
    }
    return null;
  };
}
