/**
 * TRI-143 — run the verify suite against one base URL, the way CI does.
 *
 *   node scripts/test/run-all.mjs                 # everything, localhost
 *   NZSI_BASE_URL=https://…vercel.app node scripts/test/run-all.mjs
 *   node scripts/test/run-all.mjs tri126 tri132   # a subset
 *   NZSI_SKIP_LLM=1 …                             # skip scripts that ask /api/ask
 *
 * Sequential with a pause between scripts (the point routes share a per-IP
 * bucket — a CI runner is one IP), one retry per script, and a verdict per
 * script: PASS, FAIL, or AMBER when the only failure was an upstream stall
 * (council/LINZ services time out; the scripts already say "unavailable"
 * honestly, so an amber run is a data-source problem, not a regression).
 * Writes a markdown table to $GITHUB_STEP_SUMMARY when set. Exit 1 on any
 * FAIL; AMBER exits 0 but is reported.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const LLM = new Set(["tri83", "tri85", "tri93", "tri104", "tri-design"]);
const NEEDS_DEV_HOOKS = new Set(["tri104", "tri122", "tri141"]); // window.__nzsiMap (dev, or NEXT_PUBLIC_NZSI_TEST_HOOKS=1)
const ALL = ["mobile-shell", "tri85", "tri93", "tri106", "tri112", "tri83", "tri104", "tri122", "tri123", "tri126", "tri127", "tri128", "tri129", "tri130", "tri131", "tri132", "tri133", "tri141", "tri142", "tri-design"];
const UPSTREAM_STALL = /timeout|Timeout|ETIMEDOUT|ECONNRESET|council service unavailable|could not be reached|not checked|service unreachable|fetch failed/i;

const picked = process.argv.slice(2).filter((a) => ALL.includes(a));
let scripts = picked.length ? picked : ALL;
if (process.env.NZSI_SKIP_LLM) scripts = scripts.filter((s) => !LLM.has(s));
if (process.env.NZSI_SKIP_DEV_HOOKS) scripts = scripts.filter((s) => !NEEDS_DEV_HOOKS.has(s));
const PAUSE_MS = Number(process.env.NZSI_PAUSE_MS ?? 20000);
const base = process.env.NZSI_BASE_URL || "http://localhost:3000";

const runOnce = (t) => {
  const r = spawnSync(process.execPath, [resolve(here, `${t}-verify.mjs`)], { env: process.env, encoding: "utf8", timeout: 15 * 60 * 1000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return { ok: r.status === 0 && /\nPASS/.test(out), out };
};

const results = [];
console.log(`verify suite → ${base}\n`);
for (const [i, t] of scripts.entries()) {
  const started = Date.now();
  let r = runOnce(t);
  let retried = false;
  if (!r.ok) {
    retried = true;
    await new Promise((res) => setTimeout(res, PAUSE_MS));
    r = runOnce(t);
  }
  const secs = Math.round((Date.now() - started) / 1000);
  const lines = r.out.split("\n").map((l) => l.trim()).filter(Boolean);
  const failLine = lines.filter((l) => /FAIL:|Error:/.test(l)).slice(-1)[0] ?? lines.filter((l) => !/^at /.test(l)).slice(-1)[0] ?? "";
  const verdict = r.ok ? "PASS" : UPSTREAM_STALL.test(failLine) ? "AMBER" : "FAIL";
  results.push({ t, verdict, secs, retried, note: failLine.replace(/^Error:\s*/, "").slice(0, 160) });
  console.log(`${verdict.padEnd(5)} ${t.padEnd(13)} ${String(secs).padStart(4)}s${retried ? "  (retried)" : ""}  ${verdict === "PASS" ? "" : results.at(-1).note}`);
  if (i < scripts.length - 1) await new Promise((res) => setTimeout(res, PAUSE_MS));
}

const count = (v) => results.filter((r) => r.verdict === v).length;
const summary = [
  `## Verify suite — ${count("PASS")} pass · ${count("AMBER")} amber · ${count("FAIL")} fail`,
  ``,
  `Base URL: ${base}`,
  ``,
  `| Script | Verdict | Time | Note |`,
  `|---|---|---|---|`,
  ...results.map((r) => `| ${r.t} | ${r.verdict === "PASS" ? "✅ PASS" : r.verdict === "AMBER" ? "🟡 AMBER (upstream stall)" : "❌ FAIL"}${r.retried ? " (retried)" : ""} | ${r.secs}s | ${r.note.replace(/\|/g, "\\|")} |`),
].join("\n");
console.log(`\n${summary}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
if (count("FAIL")) process.exit(1);
console.log(count("AMBER") ? "\nAMBER — passed except for upstream stalls" : "\nPASS — verify suite");
