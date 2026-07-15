import {
  assertServerOnly,
  type ChatMessageInput,
  type ChatProvider,
  type ChatRole,
  type CompleteOptions,
  type StreamOptions,
} from "./types";

/**
 * Groq provider (TRI-31, the M6 eval). The open-weight counterpart to Claude,
 * selected via LLM_PROVIDER=groq or the per-request `provider` override. Uses
 * Groq's OpenAI-compatible REST API via raw fetch (same keyless-SDK posture as
 * gemini.ts — no new dependency). GROQ_API_KEY is server-only.
 *
 * Model note: the ticket named Llama, but Groq deprecated the Llama chat models
 * (2026-06-17). We run Qwen — genuinely open-weight — as the comparison point.
 * Qwen doesn't support Groq's *strict* JSON-schema mode (only the gpt-oss models
 * do), so complete() uses json_object mode and injects the schema into the
 * prompt; the caller's JSON.parse guard then decides validity — which is exactly
 * what the eval measures. Streaming and structured output are never needed in the
 * same call (PLAN is non-streaming JSON, ANSWER is streaming text).
 */

const BASE = "https://api.groq.com/openai/v1";

const MODELS: Record<ChatRole, string> = {
  reasoning: "qwen/qwen3.6-27b",
  classification: "qwen/qwen3.6-27b",
};

function apiKey(): string {
  assertServerOnly("GroqProvider");
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set (server env)");
  return key;
}

function toMessages(
  system: string | undefined,
  messages: ChatMessageInput[],
): { role: string; content: string }[] {
  const out = messages.map((m) => ({ role: m.role, content: m.content }));
  return system ? [{ role: "system", content: system }, ...out] : out;
}

/** Append the JSON Schema to the system prompt — Qwen has no strict-schema mode
 *  (only Groq's gpt-oss models do), and json_object constrained decoding fights
 *  the model's reasoning tokens, so we guide it in-prompt and parse the result. */
function withSchema(system: string | undefined, schema: Record<string, unknown>): string {
  const instruction =
    "Respond with a single valid JSON object and nothing else — no prose, no code fences, no explanation. " +
    "It must conform to this JSON Schema:\n" +
    JSON.stringify(schema);
  return system ? `${system}\n\n${instruction}` : instruction;
}

/** Pull the JSON object out of a model reply: drop <think> reasoning and code
 *  fences, then take the first balanced {...}. Reasoning models occasionally
 *  wrap or preface the JSON even when asked not to. */
function extractJson(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  if (start === -1) return t;
  let depth = 0;
  for (let i = start; i < t.length; i++) {
    if (t[i] === "{") depth++;
    else if (t[i] === "}" && --depth === 0) return t.slice(start, i + 1);
  }
  return t.slice(start);
}

async function post(body: Record<string, unknown>, attempt = 0): Promise<Response> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify(body),
  });
  // Free-tier tokens-per-minute limits are low; back off and retry on 429.
  if (res.status === 429 && attempt < 3) {
    const retryAfter = Number(res.headers.get("retry-after")) || 3;
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 12) * 1000));
    return post(body, attempt + 1);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Groq HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res;
}

export const groqProvider: ChatProvider = {
  name: "groq",

  modelFor(role) {
    return MODELS[role];
  },

  async complete(role, opts: CompleteOptions) {
    const system = opts.jsonSchema
      ? withSchema(opts.system, opts.jsonSchema)
      : opts.system;
    const res = await post({
      model: MODELS[role],
      max_tokens: Math.max(opts.maxTokens ?? 1024, 4096),
      messages: toMessages(system, opts.messages),
      // Skip chain-of-thought for these short structured tasks: keeps output
      // small (clean JSON, no <think> leak) and within Groq's free-tier TPM.
      reasoning_effort: "none",
    });
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    return opts.jsonSchema ? extractJson(content) : content;
  },

  async *stream(role, opts: StreamOptions) {
    const res = await post({
      model: MODELS[role],
      max_tokens: Math.max(opts.maxTokens ?? 2048, 4096),
      messages: toMessages(opts.system, opts.messages),
      stream: true,
      reasoning_effort: "none", // answer directly — see complete()
    });
    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = "";
    // Backstop for models that still inline <think>…</think> despite the flag:
    // suppress any span between the tags, carrying state across SSE frames.
    let inThink = false;
    // OpenAI-style SSE: newline-delimited `data: {json}` frames, ending in [DONE].
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const chunk = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const text = chunk.choices?.[0]?.delta?.content;
          if (!text) continue;
          if (inThink) {
            const close = text.indexOf("</think>");
            if (close === -1) continue;
            inThink = false;
            const after = text.slice(close + "</think>".length);
            if (after) yield after;
            continue;
          }
          const open = text.indexOf("<think>");
          if (open === -1) {
            yield text;
          } else {
            const before = text.slice(0, open);
            if (before) yield before;
            inThink = true;
          }
        } catch {
          // partial/keepalive frame — ignore
        }
      }
    }
  },
};
