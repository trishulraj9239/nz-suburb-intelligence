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

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { scoreGrounding } from "./grounding.mjs";
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

async function ask(question, provider, persona) {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // persona is optional per-question (TRI-61); the server defaults to renter.
    body: JSON.stringify({ question, provider, persona }),
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
  // Optional: at least one cited row must come from the named source (TRI-66 —
  // e.g. a live-rent question must be answered from the MBIE bond series).
  const source_match = q.expect.sourceIncludes
    ? sources.some((s) => (s.source ?? "").includes(q.expect.sourceIncludes))
    : true;

  // TRI-110 — does each cited FIGURE match the row it cites? citations_ok only
  // proves the marker resolves. Report-only for now: it does not gate.
  const grounding = scoreGrounding(run.text, sources);

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
    source_match,
    latency_ms: run.latencyMs,
    tokens_est: tokensEst,
    cost_est_usd: costEst,
    n_sources: sources.length,
    n_citations: markers.length,
    ...grounding,
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

  // Checkpoint/resume: the suite now outruns the 10-minute background-task
  // cap, so each finished question lands in results/partial.json and a rerun
  // skips completed ids. Delete the partial for a forced full rerun; it is
  // removed automatically on successful completion.
  const PARTIAL = join(HERE, "results", "partial.json");
  let detail = [];
  try {
    detail = JSON.parse(readFileSync(PARTIAL, "utf8"));
    console.log(`resume: ${detail.length} questions already scored`);
    // detail rows store quality as the full judge object; the summary rows
    // need the numeric overall (matches what the fresh path pushes).
    for (const d of detail)
      for (const p of PROVIDERS)
        perProvider[p].push({ ...d.results[p], quality: d.results[p].quality?.overall ?? null });
  } catch {
    /* no partial — fresh run */
  }
  const done = new Set(detail.map((d) => d.id));
  mkdirSync(join(HERE, "results"), { recursive: true });

  for (const q of questions) {
    if (done.has(q.id)) continue;
    // Run both providers for this question.
    const runs = {};
    for (const provider of PROVIDERS) {
      process.stdout.write(`  ${q.id} · ${provider} … `);
      const run = { provider, ...(await ask(q.question, provider, q.persona)) };
      const s = score(q, run);
      runs[provider] = { run, score: s };
      perProvider[provider].push(s);
      console.log(
        `${s.latency_ms}ms  plan=${s.plan_valid} cites=${s.citations_ok} refusal=${s.refusal_ok}${q.expect.sourceIncludes ? ` src=${s.source_match}` : ""}`,
      );
    }

    // Blind A/B judge — randomise slot assignment (plain node: Math.random is fine).
    const aIsAnthropic = Math.random() < 0.5;
    const A = aIsAnthropic ? "anthropic" : "groq";
    const B = aIsAnthropic ? "groq" : "anthropic";
    // TRI-113 — each answer's OWN rows. Plans are per provider, so row sets
    // can differ entirely; one shared set produced false fabrication verdicts.
    const rowsA = runs[A].run.meta?.sources ?? [];
    const rowsB = runs[B].run.meta?.sources ?? [];
    let quality = null;
    let judgeError = null;
    // TRI-110 issue 4 — a judge failure used to drop the question from the
    // average silently, shifting the headline number. The observed failures
    // (q16 one day, q12 another) don't reproduce with identical inputs, so
    // they're transient: retry, and if it still fails, record the error so the
    // dropout is visible in the results rather than inferred from a null.
    for (let attempt = 1; attempt <= 3 && !quality; attempt++) {
      try {
        const verdict = await judge(q.question, runs[A].run.text, runs[B].run.text, rowsA, rowsB);
        quality = { anthropic: aIsAnthropic ? verdict.a : verdict.b, groq: aIsAnthropic ? verdict.b : verdict.a };
        judgeError = null;
      } catch (e) {
        judgeError = e.message;
        console.log(`  ! judge attempt ${attempt}/3 failed for ${q.id}: ${e.message}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
    if (quality) {
      runs.anthropic.score.quality = quality.anthropic.overall;
      runs.groq.score.quality = quality.groq.overall;
      // TRI-113 — the deterministic layer has been right both times the
      // judge cried fabrication. When the judge scores grounding low but the
      // markers all resolve AND every checked figure matches its row, the
      // verdict is annotated as disputed rather than silently trusted.
      // Only with REAL deterministic evidence (citations actually present) —
      // an empty or data-less answer passes those checks vacuously, and the
      // judge is right to score it low.
      for (const p of PROVIDERS) {
        const v = quality[p];
        if (v.grounded <= 2 && runs[p].score.n_citations > 0 && runs[p].score.values_grounded && runs[p].score.citations_ok) {
          v.disputed =
            "judge grounding verdict contradicted by deterministic checks (all markers resolve; all checked figures match their rows)";
          console.log(`  ! disputed verdict: ${q.id} · ${p} · judge grounded=${v.grounded}`);
        }
      }
    }

    detail.push({
      id: q.id,
      intent: q.intent,
      question: q.question,
      judge_error: judgeError,
      results: Object.fromEntries(
        // TRI-110 — persist the ROWS too. Without them a disputed judgement
        // can't be re-examined after the fact, which is exactly what happened
        // when the judge cried fabrication on q22 and the evidence was gone.
        PROVIDERS.map((p) => [
          p,
          {
            ...runs[p].score,
            answer: runs[p].run.text,
            sources: runs[p].run.meta?.sources ?? [],
            quality: quality?.[p] ?? null,
          },
        ]),
      ),
    });
    writeFileSync(PARTIAL, JSON.stringify(detail));
  }

  // ---- Emit -----------------------------------------------------------------
  const raw = { base: BASE, judge_model: JUDGE_MODEL, providers: PRICING, questions: detail };
  // No Date.now()-based filename to keep runs diffable; overwrite latest.*
  writeFileSync(join(HERE, "results", "latest.json"), JSON.stringify(raw, null, 2));

  const header =
    "# Model tradeoff eval (TRI-31)\n\n" +
    `Claude vs open-weight on ${questions.length} fixed suburb questions, scored against the live \`/api/ask\` pipeline. ` +
    `Quality is Claude Opus 4.8 as a blind judge (1-5). Tokens/cost are **estimated** (chars/4 × published rates; Groq free tier ≈ $0).\n\n` +
    "| Model | Plan valid | Citations OK | Figures grounded | Refusal OK | Avg quality | Avg latency | Est. cost/run |\n" +
    "|---|---|---|---|---|---|---|---|\n";
  const body = PROVIDERS.map((p) => {
    const rows = perProvider[p];
    const q = rows.filter((r) => r.quality != null);
    // Show how many questions the average is OVER — a judge dropout must not
    // silently shift the headline number (TRI-110 issue 4).
    const qAvg = q.length ? `${avg(q, "quality").toFixed(1)}/5 (${q.length}/${rows.length} judged)` : "—";
    return `| ${PRICING[p].label} | ${pct(rows, "plan_valid")} | ${pct(rows, "citations_ok")} | ${pct(rows, "values_grounded")} | ${pct(rows, "refusal_ok")} | ${qAvg} | ${Math.round(avg(rows, "latency_ms"))}ms | $${avg(rows, "cost_est_usd").toFixed(5)} |`;
  }).join("\n");
  const md = header + body + "\n";
  writeFileSync(join(HERE, "results", "latest.md"), md);

  console.log("\n" + md);
  // TRI-114 — values_grounded GATES like citations_ok (decision 2026-08-10:
  // zero false positives across ~170 scored answers since the extractor
  // hardening; two true positives). Anything below N/N needs each flag
  // adjudicated, so put the evidence straight in the output.
  const attention = [];
  for (const d of detail) {
    for (const p of PROVIDERS) {
      const r = d.results[p];
      for (const m of r.value_mismatches ?? []) {
        attention.push(`  ${d.id} · ${p} · c${m.marker}: claimed ${m.claimed} vs row ${m.actual} (${m.row})`);
      }
      if (r.quality?.disputed) attention.push(`  ${d.id} · ${p} · ${r.quality.disputed}`);
    }
  }
  if (attention.length) console.log("Gate attention:\n" + attention.join("\n") + "\n");
  console.log(`Wrote scripts/eval/results/latest.json and latest.md`);
  rmSync(PARTIAL, { force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
