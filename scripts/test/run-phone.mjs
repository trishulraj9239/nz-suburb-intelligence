/**
 * TRI-151 — the phone regression harness. Replays the address-epic verify
 * scripts at 390 × 844 (via NZSI_VIEWPORT) in sequence, paced for the public
 * rate limiter (one pin ≈ 8 point lookups against a 10-burst / 0.5-per-second
 * bucket), and reports PASS / FAIL per script. Exit code 1 if any failed.
 *
 *   npm run dev                      # in another shell
 *   node scripts/test/run-phone.mjs  # ~15 minutes
 *   node scripts/test/run-phone.mjs tri122 tri141   # a subset
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ALL = ["tri122", "tri123", "tri126", "tri127", "tri128", "tri129", "tri130", "tri131", "tri132", "tri141"];
const picked = process.argv.slice(2).filter((a) => ALL.includes(a));
const scripts = picked.length ? picked : ALL;
const PAUSE_MS = Number(process.env.NZSI_PAUSE_MS ?? 20000);

const results = [];
for (const [i, t] of scripts.entries()) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [resolve(here, `${t}-verify.mjs`)], {
    env: { ...process.env, NZSI_VIEWPORT: process.env.NZSI_VIEWPORT ?? "390x844" },
    encoding: "utf8",
    timeout: 5 * 60 * 1000,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const ok = r.status === 0 && /PASS/.test(out);
  const last = out.trim().split("\n").filter(Boolean).slice(-1)[0] ?? "";
  results.push({ t, ok, secs: Math.round((Date.now() - started) / 1000), last: last.replace(/^\s*Error:\s*/, "").slice(0, 160) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${t}  (${results.at(-1).secs}s)  ${ok ? "" : results.at(-1).last}`);
  if (i < scripts.length - 1) await new Promise((res) => setTimeout(res, PAUSE_MS));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed at ${process.env.NZSI_VIEWPORT ?? "390x844"}`);
if (failed.length) {
  for (const f of failed) console.log(`  ${f.t}: ${f.last}`);
  process.exit(1);
}
console.log("\nPASS — phone regression harness");
