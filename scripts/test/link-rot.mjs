/**
 * TRI-144 — link-rot check for every outbound page the app sends people to:
 * the "Not held by this app" link-outs, the council Flood Viewer / GeoMaps /
 * Unitary Plan links, and the LINZ basemap attribution feed.
 *
 *   node scripts/test/link-rot.mjs          (npm run test:links)
 *
 * The URLs are read from the source files themselves (no second list to
 * drift), fetched with a browser User-Agent (Cloudflare fronts several of
 * them), redirects followed. A URL FAILS on 4xx/5xx, a network error, or a
 * redirect that lands on a different host (a moved page that now redirects
 * to a homepage is rot in disguise). The final URL is printed for every link
 * so a moved-but-redirecting page is visible before it 404s. Exit 1 on any
 * failure; a markdown table goes to $GITHUB_STEP_SUMMARY when set.
 *
 * Not checked here: the data services (ArcGIS, LINZ WFS, Stats NZ mirrors) —
 * those are exercised by the verify scripts against a running app.
 */
import { readFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILES = ["lib/link-outs.ts", "lib/property/copy.ts", "lib/point-overlays.ts", "lib/point-hazards.ts", "lib/built-form-point.ts"];
const SKIP = /arcgis\.com\/n4yPwebTjJCmXB6W|services[0-9]\.arcgis\.com|data\.linz\.govt\.nz|api\.groq|generativelanguage|supabase|openrouteservice\.org\/v2|\$\{/;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 NZSI-link-check";

const urls = new Map();
for (const f of FILES) {
  let src = "";
  try { src = readFileSync(resolve(root, f), "utf8"); } catch { continue; }
  for (const m of src.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
    const u = m[0].replace(/[.,;]+$/, "");
    if (SKIP.test(u)) continue;
    if (!urls.has(u)) urls.set(u, f);
  }
}
// The LINZ attribution feed needs the public key; check the host answers at all.
urls.set("https://basemaps.linz.govt.nz/", "lib/built-form-point.ts");

async function check(url) {
  const started = Date.now();
  try {
    let r = await fetch(url, { method: "HEAD", redirect: "follow", headers: { "user-agent": UA, accept: "text/html,*/*" }, signal: AbortSignal.timeout(20000) });
    if (r.status === 405 || r.status === 403 || r.status === 404) r = await fetch(url, { method: "GET", redirect: "follow", headers: { "user-agent": UA, accept: "text/html,*/*" }, signal: AbortSignal.timeout(20000) });
    const finalUrl = r.url || url;
    const sameHost = new URL(finalUrl).host.replace(/^www\./, "") === new URL(url).host.replace(/^www\./, "");
    const ok = r.status < 400 && sameHost;
    return { url, status: r.status, finalUrl, ok, note: !sameHost ? "redirected to another host" : r.status >= 400 ? `HTTP ${r.status}` : finalUrl !== url ? "redirects (still same host)" : "", ms: Date.now() - started };
  } catch (e) {
    return { url, status: 0, finalUrl: "", ok: false, note: (e && e.message) || "network error", ms: Date.now() - started };
  }
}

const results = [];
for (const [url, file] of urls) {
  const r = await check(url);
  results.push({ ...r, file });
  console.log(`${r.ok ? "OK  " : "FAIL"} ${String(r.status).padStart(3)} ${url}${r.finalUrl && r.finalUrl !== url ? `  → ${r.finalUrl}` : ""}${r.note ? `  (${r.note})` : ""}`);
}
const failed = results.filter((r) => !r.ok);
const summary = [
  `## Link-rot check — ${results.length - failed.length}/${results.length} OK`,
  ``,
  `| Link | Status | Final URL | Note | In |`,
  `|---|---|---|---|---|`,
  ...results.map((r) => `| ${r.url} | ${r.ok ? "✅" : "❌"} ${r.status} | ${r.finalUrl !== r.url ? r.finalUrl : "—"} | ${r.note} | \`${r.file}\` |`),
].join("\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
console.log(`\n${results.length - failed.length}/${results.length} links OK`);
if (failed.length) {
  console.log("Fix = the one-line constant in the file named above plus the docs/sources.md row.");
  process.exit(1);
}
console.log("\nPASS — no link rot");
