/**
 * M6 eval harness (TRI-31) — Claude vs open-weight (Qwen on Groq).
 *
 * For each fixed question, POST /api/ask twice — once per provider — parse the
 * NDJSON stream, and score deterministic metrics (plan validity, citation
 * fidelity, refusal-correctness, latency, estimated tokens/cost). Then Claude
 * Opus 4.8 judges the two answers blind (scripts/eval/judge.mjs). Writes a raw
 * JSON dump and a markdown tradeoff table to scripts/eval/results/.
 *
 * Preconditions: the app must be running locally with GROQ_API_KEY and
 * ANTHROPIC_API_KEY in its env (npm run dev), and ANTHROPIC_API_KEY reachable to
 * this script (env or .env.local) for the judge.
 *
 *   npm run dev              # in one terminal, with both keys set
 *   npm run eval             # in another
 *
 * Override the target with EVAL_BASE_URL (default http://localhost:3000).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { judge, JUDGE_MODEL } from "./judge.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.EVAL_BASE_URL || "http://localhost:3000";
const PROVIDERS = ["anthropic", "groq"];

// Rough $/1M-token rates for an *estimated* cost column (tokens are estimated as
// chars/4). Claude Sonnet 4.6 rates are exact; the Groq/Qwen rate is a
// placeholder — verify against Groq's current pricing (free tier ≈ $0).
const PRICING = {
  anthropic: { label: "Claude Sonnet 4.6", inPerM: 3, outPerM: 15 },
  groq: { label: "Qwen 3.6 27B (Groq)", inPerM: 0.2, outPerM: 0.2 },
};

const CITE = /\{\{c(\d+)\}\}/g;

async function ask(question, provider) {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, provider }),
  });
  // Non-2xx (e.g. 502 planning failed) → invalid plan, a real result.
  if (!res.ok) {
    return { ok: false, latencyMs: Date.now() - started, meta: null, text: "", raw: await res.text().catch(() => "") };
  }
  const body = await res.text();
  const latencyMs = Date.now() - started;
  let meta = null;
  let text = "";
  let error = null;
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      continue;
    }
    if (frame.type === "meta") meta = frame;
    else if (frame.type === "delta") text += frame.text;
    else if (frame.type === "error") error = frame.message;
  }
  return { ok: meta != null && !error, latencyMs, meta, text, error };
}

function score(q, run) {
  const sources = run.meta?.sources ?? [];
  const markers = [...run.text.matchAll(CITE)].map((m) => Number(m[1]));
  const sourceNs = new Set(sources.map((s) => s.n));

  const plan_valid = run.meta != null;
  // Every citation marker resolves to a returned row.
  const citations_ok = markers.length > 0 ? markers.every((n) => sourceNs.has(n)) : sources.length === 0;
  // Unsupported: should decline — no fabricated figures, no citations.
  const declined = (run.meta?.intent === "unsupported" || sources.length === 0) && markers.length === 0;
  const refusal_ok = q.expect.unsupported ? declined : !declined || sources.length === 0;
  const enoughSources = sources.length >= (q.expect.minSources ?? 0);

  const tokensEst = Math.ceil((q.question.length + run.text.length) / 4);
  const p = PRICING[run.provider];
  // Split estimate: question ~ input, answer ~ output.
  const inTok = Math.ceil(q.question.length / 4);
  const outTok = Math.ceil(run.text.length / 4);
  const costEst = (inTok * p.inPerM + outTok * p.outPerM) / 1_000_000;

  return {
    plan_valid,
    citations_ok,
    refusal_ok,
    enough_sources: enoughSources,
    latency_ms: run.latencyMs,
    tokens_est: tokensEst,
    cost_est_usd: costEst,
    n_sources: sources.length,
    n_citations: markers.length,
    model: run.meta?.models?.answer ?? p.label,
  };
}

function pct(rows, key) {
  const n = rows.filter((r) => r[key]).length;
  return `${n}/${rows.length}`;
}
function avg(rows, key) {
  return rows.reduce((s, r) => s + (r[key] ?? 0), 0) / (rows.length || 1);
}

async function main() {
  const questions = JSON.parse(readFileSync(join(HERE, "questions.json"), "utf8"));
  const perProvider = Object.fromEntries(PROVIDERS.map((p) => [p, []]));
  const detail = [];

  for (const q of questions) {
    // Run both providers for this question.
    const runs = {};
    for (const provider of PROVIDERS) {
      process.stdout.write(`  ${q.id} · ${provider} … `);
      const run = { provider, ...(await ask(q.question, provider)) };
      const s = score(q, run);
      runs[provider] = { run, score: s };
      perProvider[provider].push(s);
      console.log(`${s.latency_ms}ms  plan=${s.plan_valid} cites=${s.citations_ok} refusal=${s.refusal_ok}`);
    }

    // Blind A/B judge — randomise slot assignment (plain node: Math.random is fine).
    const aIsAnthropic = Math.random() < 0.5;
    const A = aIsAnthropic ? "anthropic" : "groq";
    const B = aIsAnthropic ? "groq" : "anthropic";
    const rows = runs[A].run.meta?.sources ?? runs[B].run.meta?.sources ?? [];
    let quality = null;
    try {
      const verdict = await judge(q.question, runs[A].run.text, runs[B].run.text, rows);
      quality = { anthropic: aIsAnthropic ? verdict.a : verdict.b, groq: aIsAnthropic ? verdict.b : verdict.a };
    } catch (e) {
      console.log(`  ! judge failed for ${q.id}: ${e.message}`);
    }
    if (quality) {
      runs.anthropic.score.quality = quality.anthropic.overall;
      runs.groq.score.quality = quality.groq.overall;
    }

    detail.push({
      id: q.id,
      intent: q.intent,
      question: q.question,
      results: Object.fromEntries(
        PROVIDERS.map((p) => [p, { ...runs[p].score, answer: runs[p].run.text, quality: quality?.[p] ?? null }]),
      ),
    });
  }

  // ---- Emit -----------------------------------------------------------------
  mkdirSync(join(HERE, "results"), { recursive: true });
  const raw = { base: BASE, judge_model: JUDGE_MODEL, providers: PRICING, questions: detail };
  // No Date.now()-based filename to keep runs diffable; overwrite latest.*
  writeFileSync(join(HERE, "results", "latest.json"), JSON.stringify(raw, null, 2));

  const header =
    "# Model tradeoff eval (TRI-31)\n\n" +
    `Claude vs open-weight on ${questions.length} fixed suburb questions, scored against the live \`/api/ask\` pipeline. ` +
    `Quality is Claude Opus 4.8 as a blind judge (1-5). Tokens/cost are **estimated** (chars/4 × published rates; Groq free tier ≈ $0).\n\n` +
    "| Model | Plan valid | Citations OK | Refusal OK | Avg quality | Avg latency | Est. cost/run |\n" +
    "|---|---|---|---|---|---|---|\n";
  const body = PROVIDERS.map((p) => {
    const rows = perProvider[p];
    const q = rows.filter((r) => r.quality != null);
    const qAvg = q.length ? avg(q, "quality").toFixed(1) : "—";
    return `| ${PRICING[p].label} | ${pct(rows, "plan_valid")} | ${pct(rows, "citations_ok")} | ${pct(rows, "refusal_ok")} | ${qAvg}/5 | ${Math.round(avg(rows, "latency_ms"))}ms | $${avg(rows, "cost_est_usd").toFixed(5)} |`;
  }).join("\n");
  const md = header + body + "\n";
  writeFileSync(join(HERE, "results", "latest.md"), md);

  console.log("\n" + md);
  console.log(`Wrote scripts/eval/results/latest.json and latest.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
