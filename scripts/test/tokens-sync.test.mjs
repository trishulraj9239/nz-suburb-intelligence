/**
 * Design-token discipline (TRI-145, Phase A). Three checks:
 *  1. app/tokens.css is exactly what lib/tokens.ts emits (run `npm run tokens`).
 *  2. No component uses a font size below the scale's floor (text-[9|10|11px]).
 *  3. No hex colour outside app/tokens.css and lib/tokens.ts (everything reads
 *     the tokens; MapLibre paint reads them through token()).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

test("app/tokens.css is in sync with lib/tokens.ts", () => {
  execFileSync(process.execPath, [join(root, "scripts/tokens/emit-css.mjs"), "--check"], { stdio: "pipe" });
});

test("no font size below the 12px floor in components/ or app/", () => {
  const files = [...walk(join(root, "components"), [".tsx"]), ...walk(join(root, "app"), [".tsx"])];
  const offenders = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const m = src.match(/text-\[(9|10|11)px\]|leading-\[14px\]/g);
    if (m) offenders.push(`${f.replace(root, "")}: ${[...new Set(m)].join(", ")}`);
  }
  assert.deepEqual(offenders, [], `sub-floor sizes found:\n${offenders.join("\n")}`);
});

test("no hex colours outside the token files", () => {
  const files = [...walk(join(root, "components"), [".tsx"]), ...walk(join(root, "app"), [".tsx", ".css"]), ...walk(join(root, "lib"), [".ts", ".tsx"])];
  const allowed = new Set([join(root, "app", "tokens.css"), join(root, "lib", "tokens.ts")]);
  const offenders = [];
  for (const f of files) {
    if (allowed.has(f)) continue;
    const src = readFileSync(f, "utf8");
    const m = src.match(/#[0-9a-fA-F]{6}\b/g);
    if (m) offenders.push(`${f.replace(root, "")}: ${[...new Set(m)].join(", ")}`);
  }
  assert.deepEqual(offenders, [], `hex outside tokens:\n${offenders.join("\n")}`);
});
