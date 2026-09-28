import Anthropic from "@anthropic-ai/sdk";
import {
  assertServerOnly,
  type ChatMessageInput,
  type ChatProvider,
  type ChatRole,
  type CompleteOptions,
  type StreamOptions,
  type SystemPrompt,
} from "./types";

/**
 * Claude provider (TRI-27). Role routing per the board spec:
 *   reasoning      → claude-sonnet-4-6 (user-facing prose, text-to-query)
 *   classification → claude-haiku-4-5  (cheap intent/label calls)
 * Cost posture: effort set explicitly (Sonnet 4.6 defaults to high), thinking
 * off for these short structured tasks. ANTHROPIC_API_KEY is server-only and
 * read by the SDK from the environment — never passed from client code.
 */

const MODELS: Record<ChatRole, string> = {
  reasoning: "claude-sonnet-4-6",
  classification: "claude-haiku-4-5",
};

let _client: Anthropic | null = null;
function client(): Anthropic {
  assertServerOnly("AnthropicProvider");
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set (server env)");
  }
  _client ??= new Anthropic();
  return _client;
}

function toMessages(messages: ChatMessageInput[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * TRI-80 — prompt caching. A split system prompt becomes two text blocks with
 * cache_control on the stable one, so the registry block and the answer rules
 * (thousands of tokens, identical every request) are read from the cache
 * after the first call in a 5-minute window; only the persona / preference
 * tail and the question are billed at full rate. A plain string is passed
 * through unchanged (Anthropic ignores prefixes under 1,024 tokens anyway).
 */
function toSystem(s: SystemPrompt | undefined): string | Anthropic.TextBlockParam[] | undefined {
  if (s === undefined || typeof s === "string") return s;
  const blocks: Anthropic.TextBlockParam[] = [{ type: "text", text: s.stable, cache_control: { type: "ephemeral" } }];
  if (s.variable) blocks.push({ type: "text", text: s.variable });
  return blocks;
}

/** NZSI_LLM_LOG=1 prints cache usage per call — the way to verify caching works. */
function logUsage(label: string, usage: { input_tokens?: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null } | undefined) {
  if (process.env.NZSI_LLM_LOG !== "1" || !usage) return;
  console.log(`[llm:anthropic] ${label} input=${usage.input_tokens ?? 0} cache_created=${usage.cache_creation_input_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0}`);
}

export const anthropicProvider: ChatProvider = {
  name: "anthropic",

  modelFor(role) {
    return MODELS[role];
  },

  async complete(role, opts: CompleteOptions) {
    const model = MODELS[role];
    const response = await client().messages.create({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      system: toSystem(opts.system),
      messages: toMessages(opts.messages),
      ...(role === "reasoning"
        ? { output_config: { effort: "low" as const } }
        : {}),
      ...(opts.jsonSchema
        ? {
            output_config: {
              effort: "low" as const,
              format: {
                type: "json_schema" as const,
                schema: opts.jsonSchema,
              },
            },
          }
        : {}),
    });
    logUsage(`complete/${role}`, response.usage);
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (response.stop_reason === "refusal") {
      throw new Error("model refused the request");
    }
    return text;
  },

  async *stream(role, opts: StreamOptions) {
    const model = MODELS[role];
    const stream = client().messages.stream({
      model,
      max_tokens: opts.maxTokens ?? 2048,
      system: toSystem(opts.system),
      messages: toMessages(opts.messages),
      output_config: { effort: "low" },
    });
    for await (const event of stream) {
      if (event.type === "message_start") logUsage(`stream/${role}`, event.message.usage);
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  },
};
