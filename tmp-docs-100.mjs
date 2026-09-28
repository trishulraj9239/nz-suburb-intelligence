import fs from "node:fs";
const rw = (p, fn) => { let s = fs.readFileSync(p, "utf8"); const crlf = s.includes("\r\n"); s = s.replace(/\r\n/g, "\n"); const o = fn(s); if (o === s) { console.log("NOCHANGE", p); process.exit(1); } fs.writeFileSync(p, crlf ? o.replace(/\n/g, "\r\n") : o); console.log("ok", p); };
rw("docs/nl-test-questions.md", (s) => s.trimEnd() + `

## Polish (TRI-100) — manual checks

| Do | Expect |
|---|---|
| press **/** anywhere outside a field | the ask box takes focus with its text selected; inside a field "/" types a slash |
| look at the map legend while shading is on | four quintile boundaries in the metric's own units under the ramp, and a hatched swatch labelled "no data" |
| find a suburb with no value for the shaded metric (e.g. an oceanic SA2, or shade by consenting rate) | it is hatched, not blank |
| turn on **Reduce motion** in the OS, select a suburb | the map jumps, it does not fly |
| Compare tab → **Export CSV** | \`nzsi-compare-<codes>.csv\`: one row per metric, a value column per suburb, then source · as_of · confidence per suburb, and the hazard caveat row; no persona or budget |

The shade picker already lives in the Layers dock / top-right stack with the legend beside it (TRI-146), which covers item (1) of the ticket; the single-hue opacity ramp is colour-blind-safe by construction (no ramp change).

Automated: \`node scripts/test/tri100-verify.mjs\`.
` + "\n");
rw("scripts/test/README.md", (s) => s.replace("node scripts/test/tri142-verify.mjs     # rate-limit buckets", "node scripts/test/tri100-verify.mjs     # polish: '/' focuses the ask box, legend quintile breaks + no-data hatch layer, Compare CSV with provenance, reduced motion = no map animation\nnode scripts/test/tri142-verify.mjs     # rate-limit buckets"));
