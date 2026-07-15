/**
 * Post-deploy Linear updater — runs in GitHub Actions (see
 * .github/workflows/linear-deploy-sync.yml). Mirrors, in token-based CI, the
 * board-tidying the interactive agent did by hand:
 *
 *   1. Pull the TRI-XX references out of the deployed commit message.
 *   2. If the frontend changed, screenshot the live deploy (light + dark).
 *   3. Post a first-person comment to each referenced ticket, embedding the shots.
 *
 * A *personal* Linear API key (LINEAR_API_KEY) makes the comments appear as you.
 * Status transitions are intentionally left to Linear's native GitHub
 * integration; set LINEAR_SET_DONE=true to also move issues to Done from here.
 *
 * Node 18+ (global fetch). Playwright is only imported when screenshots are needed.
 */

import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const API = "https://api.linear.app/graphql";
const KEY = process.env.LINEAR_API_KEY;
const DEPLOY_URL = process.env.DEPLOY_URL;
const SHA = process.env.COMMIT_SHA || sh("git rev-parse HEAD");

if (!KEY || !DEPLOY_URL) {
  console.error("Missing LINEAR_API_KEY or DEPLOY_URL — aborting.");
  process.exit(1);
}

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

const commitMsg = sh(`git log -1 --format=%B ${SHA}`);
const commitSubject = commitMsg.split("\n")[0];
const shortSha = SHA.slice(0, 7);

// 1. TRI-XX references — dedup, preserve first-seen order.
const tickets = [...new Set(commitMsg.match(/\bTRI-\d+\b/g) || [])];
if (tickets.length === 0) {
  console.log("No TRI-XX references in commit; nothing to do.");
  process.exit(0);
}
console.log(`Tickets: ${tickets.join(", ")}`);

// 2. Did the frontend change in this commit? (cheap heuristic)
const changedFiles = sh(`git show --name-only --format= ${SHA}`).split("\n").filter(Boolean);
const frontendTouched = changedFiles.some((f) => /^(app|components)\//.test(f) || f.endsWith(".css"));
const wantShots = process.env.FORCE_SHOTS === "true" || frontendTouched;

async function linear(query, variables) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: KEY },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

// TRI-37 -> internal UUID (commentCreate/issueUpdate need the UUID).
async function resolveIssue(identifier) {
  const [teamKey, numStr] = identifier.split("-");
  const data = await linear(
    `query($key:String!,$n:Float!){ issues(filter:{ team:{ key:{ eq:$key } }, number:{ eq:$n } }){ nodes{ id state{ name } team{ id } } } }`,
    { key: teamKey, n: Number(numStr) },
  );
  return data.issues.nodes[0] || null;
}

// Upload a local PNG to Linear's CDN; returns the embeddable assetUrl.
async function uploadToLinear(filePath, filename) {
  const size = statSync(filePath).size;
  const data = await linear(
    `mutation($ct:String!,$fn:String!,$sz:Int!){ fileUpload(contentType:$ct,filename:$fn,size:$sz){ success uploadFile{ uploadUrl assetUrl headers{ key value } } } }`,
    { ct: "image/png", fn: filename, sz: size },
  );
  const uf = data.fileUpload.uploadFile;
  const headers = { "Content-Type": "image/png" };
  for (const h of uf.headers) headers[h.key] = h.value;
  const put = await fetch(uf.uploadUrl, { method: "PUT", headers, body: readFileSync(filePath) });
  if (!put.ok) throw new Error(`Asset PUT failed: HTTP ${put.status}`);
  return uf.assetUrl;
}

async function commentCreate(issueId, body) {
  await linear(
    `mutation($id:String!,$b:String!){ commentCreate(input:{ issueId:$id, body:$b }){ success } }`,
    { id: issueId, b: body },
  );
}

// Resolve the team's "Done" state, then move the issue (only if LINEAR_SET_DONE).
async function setDone(issue) {
  const data = await linear(
    `query($team:String!){ workflowStates(filter:{ team:{ id:{ eq:$team } }, type:{ eq:"completed" } }){ nodes{ id name } } }`,
    { team: issue.team.id },
  );
  const done = data.workflowStates.nodes.find((s) => s.name === "Done") || data.workflowStates.nodes[0];
  if (!done) return;
  await linear(
    `mutation($id:String!,$state:String!){ issueUpdate(id:$id, input:{ stateId:$state }){ success } }`,
    { id: issue.id, state: done.id },
  );
}

// 3. Capture screenshots of the live deploy (no clicks — robust in CI).
let uploaded = [];
if (wantShots) {
  console.log("Frontend changed — capturing screenshots of", DEPLOY_URL);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(DEPLOY_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(3500); // map render + data fetches
    await page.screenshot({ path: "home-light.png" });

    // Fresh context has no stored theme, so emulating dark makes next-themes
    // (defaultTheme=system) resolve to the dark token set.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: "home-dark.png" });
  } finally {
    await browser.close();
  }
  // Upload each once; reuse the assetUrls across every ticket.
  for (const s of [
    { path: "home-light.png", label: "Workspace — light" },
    { path: "home-dark.png", label: "Workspace — dark" },
  ]) {
    uploaded.push({ ...s, url: await uploadToLinear(s.path, s.path) });
  }
}

// 4. Comment on each referenced ticket.
const shotMd = uploaded.map((s) => `![${s.label}](${s.url})`).join("\n\n");
for (const id of tickets) {
  const issue = await resolveIssue(id);
  if (!issue) {
    console.log(`Skip ${id} — not found in workspace.`);
    continue;
  }
  const body = [
    `Shipped to production in \`${shortSha}\` — ${commitSubject}`,
    "",
    `Live: ${DEPLOY_URL}`,
    uploaded.length ? `\n${shotMd}` : "",
  ]
    .join("\n")
    .trim();

  await commentCreate(issue.id, body);
  if (process.env.LINEAR_SET_DONE === "true") await setDone(issue);
  console.log(`Commented on ${id}${process.env.LINEAR_SET_DONE === "true" ? " + set Done" : ""}`);
}

console.log("Linear sync complete.");
