/** TRI-153 — share cards: /api/og renders a PNG for a suburb, a comparison and
 *  a question; the page's OG tags point at it with the same URL state and
 *  nothing else (no preference ever reaches a preview); garbage degrades to
 *  the product card. Pure fetch — no browser needed. */
const BASE = (process.env.NZSI_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const fail = (m) => { throw new Error("FAIL: " + m); };

async function png(path) {
  const r = await fetch(`${BASE}${path}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  return { status: r.status, type: r.headers.get("content-type") || "", cache: r.headers.get("cache-control") || "", bytes: buf.length, isPng };
}
async function meta(path) {
  const html = await (await fetch(`${BASE}${path}`, { headers: { "user-agent": "Twitterbot/1.0" } })).text();
  const get = (prop) => (html.match(new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]*)"`)) || html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${prop}"`)) || [])[1] ?? null;
  return { title: get("og:title"), image: get("og:image"), desc: get("og:description"), html };
}

for (const [label, path, min] of [["suburb", "/api/og?sa2=130400", 20000], ["compare", "/api/og?compare=130400,126801", 20000], ["question", `/api/og?q=${encodeURIComponent("Which suburbs have the lowest median weekly rent?")}`, 8000], ["garbage", "/api/og?sa2=abc&compare=1,2,3,4,5", 5000]]) {
  const r = await png(path);
  if (r.status !== 200 || !r.isPng) fail(`${label}: HTTP ${r.status} ${r.type}`);
  if (r.bytes < min) fail(`${label}: only ${r.bytes} bytes`);
  if (!/max-age=3600/.test(r.cache)) fail(`${label}: no cache header (${r.cache})`);
  console.log(`${label} card: PNG ${(r.bytes / 1024).toFixed(0)} KB ✓`);
}

const s = await meta("/?sa2=130400");
if (!s.title || !/Ponsonby West/.test(s.title)) fail(`og:title for a suburb link: ${s.title}`);
if (!s.image || !/\/api\/og\?sa2=130400$/.test(s.image)) fail(`og:image for a suburb link: ${s.image}`);
if (!/^https?:\/\//.test(s.image)) fail(`og:image must be absolute: ${s.image}`);
console.log(`suburb link → ${s.title} · ${s.image} ✓`);

const c = await meta("/?sa2=126801&compare=130400,126801");
if (!c.title || !/Ponsonby West vs Takapuna Central/.test(c.title)) fail(`og:title for a compare link: ${c.title}`);
if (!/compare=130400,126801/.test(c.image ?? "")) fail(`og:image for a compare link: ${c.image}`);
console.log(`compare link → ${c.title} ✓`);

const q = await meta(`/?q=${encodeURIComponent("Cheapest rent near Takapuna?")}`);
if (!q.title || !/Cheapest rent near Takapuna\?/.test(q.title)) fail(`og:title for a question link: ${q.title}`);
console.log(`question link → ${q.title} ✓`);

// Privacy: even if someone hand-writes preference-looking params, they never reach the card.
const p = await meta("/?sa2=130400&budget=650&persona=buyer&anchors=x");
if (/budget|persona|anchors/.test(p.image ?? "")) fail(`preference-looking params leaked into og:image: ${p.image}`);
if (/budget|persona|anchors/i.test(p.desc ?? "") || /buyer/.test(p.title ?? "")) fail("preference-looking params leaked into the description/title");
console.log("preference-looking params never reach the card ✓");

const h = await meta("/");
if (h.title && /—/.test(h.title)) fail(`home should keep the plain title: ${h.title}`);
if (!/\/api\/og$/.test(h.image ?? "")) fail(`home og:image: ${h.image}`);
console.log("home keeps the product card ✓");
console.log("\nPASS — share cards");
