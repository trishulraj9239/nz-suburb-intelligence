import Anthropic from "@anthropic-ai/sdk";
import {
  assertServerOnly,
  type ChatMessageInput,
  type ChatProvider,
  type ChatRole,
  type CompleteOptions,
  type StreamOptions,
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
      system: opts.system,
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
      system: opts.system,
      messages: toMessages(opts.messages),
      output_config: { effort: "low" },
    });
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  },
};
