# Model tradeoff eval (TRI-31)

The interview differentiator: a fixed question set, scored each run, comparing
**Claude** against an **open-weight** model to produce a quality / cost / latency
story. It exercises the real `/api/ask` pipeline — the same planning, execution,
and citation contract the app uses in production.

## What it compares

- **Claude** — `claude-sonnet-4-6` (the app's default `reasoning` backend).
- **Open-weight** — `qwen/qwen3.6-27b` on Groq's free tier, wired as the `groq`
  provider in `lib/llm/`. (The ticket named Llama, but Groq deprecated the Llama
  chat models in 2026-06; Qwen is the current open-weight comparison point.)

The `provider` field on `POST /api/ask` selects the backend per request, so the
harness A/Bs both models against an unchanged server — no restart between runs.

## How it scores each answer

Deterministic (in `run.mjs`):

- **plan_valid** — the planner returned a structured plan (not a 502).
- **citations_ok** — every `{{cN}}` marker resolves to a returned source row.
- **refusal_ok** — the `unsupported` question declines instead of fabricating.
- **latency_ms** — wall-clock for the full request.
- **tokens_est / cost_est_usd** — *estimated* (chars/4 × published rates; Groq
  free tier ≈ $0). Labelled estimated on purpose.

Quality (in `judge.mjs`): **Claude Opus 4.8 as a blind judge** scores both
answers 1–5 (grounded / cited / hedged / concise / overall). Opus is a different
model from the contestant to reduce self-preference bias; answers are presented
as "Answer A / B" in randomised order.

## Run it

Preconditions: the app running locally with **both** `GROQ_API_KEY` and
`ANTHROPIC_API_KEY` in its env, and `ANTHROPIC_API_KEY` reachable to the harness
(env or `.env.local`) for the judge.

```bash
# terminal 1 — server with both keys set in .env.local
npm run dev

# terminal 2
npm run eval
```

Override the target with `EVAL_BASE_URL` (default `http://localhost:3000`) —
e.g. point it at the production deploy to eval the live app.

## Output

- `results/latest.json` — full per-question detail (answers, metrics, judge scores).
- `results/latest.md` — the tradeoff table, ready to drop into the README case
  study (TRI-33).

## Extending

- Add questions to `questions.json` (each with an `intent` and `expect` block).
  Keep at least one `unsupported` question to exercise refusal-correctness.
- Add a third model by registering another provider in `lib/llm/index.ts` and a
  pricing row in `run.mjs`.
- For exact (not estimated) tokens, surface provider `usage` in the `/api/ask`
  `done` frame and read it here instead of the chars/4 heuristic.
