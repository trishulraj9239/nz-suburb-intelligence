/**
 * TRI-16 — ETL: Auckland SA2 boundaries → geographies + map GeoJSON.
 *
 * Source: Stats NZ ArcGIS Map Hub (keyless REST), SA2 2023 (generalised) +
 * Regional Council 2023. Auckland membership is decided by point-in-polygon:
 * an SA2 belongs to Auckland iff its centroid falls inside the Auckland
 * Region polygon (region code '02'). The hub's SA2 layer carries no region
 * attribute, and the datafinder Higher-Geographies layer needs a key scope we
 * don't have — the spatial join avoids both.
 *
 * Outputs:
 *   tmp/tri16-geographies.sql      — idempotent upsert into geographies
 *   public/geo/auckland-sa2.geojson — generalised polygons for the map (M4)
 *
 * is_active rule (v1): LAND_AREA_SQ_KM > 0. Oceanic/water SA2s get false.
 * Port/airport/zero-population refinement happens after census data lands
 * (TRI-17) — population counts are the better signal for those.
 *
 * Run: node scripts/etl/tri-16-sa2-boundaries.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";

const HUB = "https://services2.arcgis.com/vKb0s8tBIA3bdocZ/arcgis/rest/services";
const REGION_CODE = "02"; // Auckland — the single coverage lever (matches geographies.region_code)
const REGION_NAME = "Auckland Region";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// --- 1. Auckland Region polygon (GeoJSON, WGS84) -------------------------
const regionFc = await getJson(
  `${HUB}/Regional_Council_2023/FeatureServer/0/query?where=REGC2023_V1_00%3D%27${REGION_CODE}%27&outFields=REGC2023_V1_00&outSR=4326&f=geojson`,
);
const regionGeom = regionFc.features[0].geometry; // Polygon or MultiPolygon
const regionRings =
  regionGeom.type === "MultiPolygon"
    ? regionGeom.coordinates
    : [regionGeom.coordinates];

// Ray-casting point-in-polygon over MultiPolygon rings (outer ring only per
// polygon — region holes are lakes; SA2 centroids in lakes are fine to keep).
function inRegion([x, y]) {
  for (const poly of regionRings) {
    const ring = poly[0];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

// --- 2. All SA2 centroids + attributes (paginated) ------------------------
const sa2 = [];
for (let offset = 0; ; offset += 2000) {
  const page = await getJson(
    `${HUB}/Statistical_Area_2_2023/FeatureServer/0/query?where=1%3D1&outFields=SA22023_V1_00,SA22023_V1_00_NAME,LAND_AREA_SQ_KM&returnGeometry=false&returnCentroid=true&outSR=4326&f=json&resultRecordCount=2000&resultOffset=${offset}`,
  );
  sa2.push(...page.features);
  if (!page.exceededTransferLimit && page.features.length < 2000) break;
}
console.log(`national SA2s: ${sa2.length}`);

// --- 3. Spatial filter to Auckland ----------------------------------------
const auckland = sa2.filter(
  (f) => f.centroid && inRegion([f.centroid.x, f.centroid.y]),
);
console.log(`auckland SA2s: ${auckland.length}`);

// --- 4. Upsert SQL ---------------------------------------------------------
const esc = (s) => String(s).replace(/'/g, "''");
const dp6 = (n) => Math.round(n * 1e6) / 1e6; // ~0.1 m — ample for centroids
const values = auckland
  .map((f) => {
    const a = f.attributes;
    const active = a.LAND_AREA_SQ_KM > 0;
    return `('SA2','${esc(a.SA22023_V1_00)}','${esc(a.SA22023_V1_00_NAME)}','${REGION_CODE}','${REGION_NAME}',ST_SetSRID(ST_MakePoint(${dp6(f.centroid.x)},${dp6(f.centroid.y)}),4326)::geography,${dp6(a.LAND_AREA_SQ_KM)},${active})`;
  })
  .join(",\n");

const sql = `insert into geographies
  (geo_type, sa2_code, name, region_code, region_name, centroid, land_area_km2, is_active)
values
${values}
on conflict (geo_type, sa2_code) do update set
  name = excluded.name,
  region_code = excluded.region_code,
  region_name = excluded.region_name,
  centroid = excluded.centroid,
  land_area_km2 = excluded.land_area_km2,
  is_active = excluded.is_active;
`;
mkdirSync("tmp", { recursive: true });
writeFileSync("tmp/tri16-geographies.sql", sql);
console.log(`wrote tmp/tri16-geographies.sql (${auckland.length} rows)`);

// --- 5. Map GeoJSON: polygons for the Auckland set, coords rounded ---------
const codes = new Set(auckland.map((f) => f.attributes.SA22023_V1_00));
const features = [];
for (let offset = 0; ; offset += 500) {
  const page = await getJson(
    `${HUB}/Statistical_Area_2_2023/FeatureServer/0/query?where=1%3D1&outFields=SA22023_V1_00,SA22023_V1_00_NAME&outSR=4326&f=geojson&resultRecordCount=500&resultOffset=${offset}`,
  );
  for (const f of page.features) {
    if (codes.has(f.properties.SA22023_V1_00)) features.push(f);
  }
  if (page.features.length < 500) break;
}
const round = (n) => Math.round(n * 1e5) / 1e5; // ~1 m precision
const roundCoords = (c) =>
  typeof c[0] === "number" ? [round(c[0]), round(c[1])] : c.map(roundCoords);
for (const f of features) f.geometry.coordinates = roundCoords(f.geometry.coordinates);

mkdirSync("public/geo", { recursive: true });
writeFileSync(
  "public/geo/auckland-sa2.geojson",
  JSON.stringify({ type: "FeatureCollection", features }),
);
console.log(`wrote public/geo/auckland-sa2.geojson (${features.length} features)`);
