/**
 * LLM-as-judge for the M6 eval (TRI-31). Claude Opus 4.8 scores two answers to
 * the same question, **blind** (Answer A / Answer B, order randomised by the
 * caller) against a fixed rubric. Opus is deliberately a *different* model from
 * the contestant (Sonnet 4.6) to reduce self-preference bias.
 *
 * Imports @anthropic-ai/sdk directly (an installed dep, ESM-importable from
 * .mjs); the lib/llm TS modules are not importable here, which is why the rest
 * of the harness talks to /api/ask over HTTP. Reads ANTHROPIC_API_KEY from the
 * environment or, per repo convention, by regex from .env.local.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

const JUDGE_MODEL = "claude-opus-4-8";

function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const m = readFileSync(".env.local", "utf8").match(/^ANTHROPIC_API_KEY=(.+)$/m);
  if (!m) throw new Error("ANTHROPIC_API_KEY not in env or .env.local");
  return m[1].trim();
}

let _client = null;
function client() {
  _client ??= new Anthropic({ apiKey: apiKey() });
  return _client;
}

// Structured-output schema. JSON-schema numeric bounds (minimum/maximum) aren't
// supported by structured outputs, so the 1-5 range is stated in the prompt.
const SCORE = {
  type: "object",
  additionalProperties: false,
  properties: {
    grounded: { type: "integer", description: "Uses only the provided rows; no invented figures. 1-5." },
    cited: { type: "integer", description: "Figures carry correct {{cN}} citation markers. 1-5." },
    hedged: { type: "integer", description: "Appropriately hedges on medium/low confidence or missing data. 1-5." },
    concise: { type: "integer", description: "Clear and to the point, no filler. 1-5." },
    overall: { type: "integer", description: "Overall answer quality. 1-5." },
    note: { type: "string", description: "One sentence justifying the overall score." },
  },
  required: ["grounded", "cited", "hedged", "concise", "overall", "note"],
};
const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { a: SCORE, b: SCORE },
  required: ["a", "b"],
};

const SYSTEM =
  "You are an impartial evaluator of answers from a New Zealand suburb-data assistant. " +
  "Each answer must use ONLY the numbered data rows provided, attach a {{cN}} citation marker to every figure, " +
  "hedge when confidence is medium/low, and stay concise (2-5 sentences). Deprivation and ethnicity are information, " +
  "never a 'better/worse' verdict. Score each answer 1-5 (5 best) on each rubric dimension. Be strict about grounding " +
  "and citations: an answer that states a number absent from the rows, or omits its {{cN}} marker, scores low on those dimensions. " +
  "If a question asks for data the assistant doesn't have (e.g. crime), the correct answer politely declines — reward that, don't penalise it.";

/**
 * @param {string} question
 * @param {string} answerA  answer text (with {{cN}} markers) for slot A
 * @param {string} answerB  answer text for slot B
 * @param {Array}  rows     the shared source rows both answers were given
 * @returns {Promise<{a: object, b: object}>}
 */
export async function judge(question, answerA, answerB, rows) {
  const dataBlock = rows
    .map((r) => `[${r.n}] ${r.suburb} — ${r.label}: ${r.value}${r.unit ? ` ${r.unit}` : ""} (${r.source}, ${String(r.as_of).slice(0, 4)}, confidence ${r.confidence})`)
    .join("\n");
  const prompt =
    `Question: ${question}\n\n` +
    `Data rows both answers were given:\n${dataBlock || "(none — the assistant should decline)"}\n\n` +
    `Answer A:\n${answerA || "(empty)"}\n\n` +
    `Answer B:\n${answerB || "(empty)"}\n\n` +
    `Score Answer A and Answer B independently on the rubric.`;

  const res = await client().messages.create({
    model: JUDGE_MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: { type: "json_schema", schema: JUDGE_SCHEMA } },
  });
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text);
}

export { JUDGE_MODEL };
