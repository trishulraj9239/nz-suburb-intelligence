// One-off: derive the Auckland coverage outline from the SA2 polygons by
// dissolving shared edges. Interior edges are traversed by exactly two adjacent
// polygons (once in each direction) and cancel; edges that appear only once are
// the coverage boundary (outer coast + any internal gaps). Emits a small
// MultiLineString (with a bbox) the map draws as a dark coverage frame and fits
// the view to. Re-run if public/geo/auckland-sa2.geojson changes:
//   node scripts/build-coverage-outline.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "public/geo/auckland-sa2.geojson");
const OUT = join(root, "public/geo/auckland-coverage.geojson");

const fc = JSON.parse(readFileSync(SRC, "utf8"));

/** rings of a feature, regardless of Polygon / MultiPolygon */
function* rings(geom) {
  if (!geom) return;
  if (geom.type === "Polygon") yield* geom.coordinates;
  else if (geom.type === "MultiPolygon") for (const poly of geom.coordinates) yield* poly;
}

const seg = new Map(); // undirected edge key -> { a, b, n }
const keyOf = (p) => `${p[0]},${p[1]}`;

for (const f of fc.features) {
  for (const ring of rings(f.geometry)) {
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = ring[i];
      const b = ring[i + 1];
      const ka = keyOf(a);
      const kb = keyOf(b);
      if (ka === kb) continue; // zero-length
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const e = seg.get(key);
      if (e) e.n++;
      else seg.set(key, { a, b, n: 1 });
    }
  }
}

const lines = [];
let minX = 180, minY = 90, maxX = -180, maxY = -90;
for (const { a, b, n } of seg.values()) {
  if (n !== 1) continue; // interior edge — cancels
  lines.push([a, b]);
  for (const [x, y] of [a, b]) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

const out = {
  type: "FeatureCollection",
  bbox: [minX, minY, maxX, maxY],
  features: [
    { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: lines } },
  ],
};

writeFileSync(OUT, JSON.stringify(out));
console.log(
  `coverage outline: ${lines.length} boundary segments, bbox [${out.bbox.map((v) => v.toFixed(4)).join(", ")}] -> ${OUT}`,
);
