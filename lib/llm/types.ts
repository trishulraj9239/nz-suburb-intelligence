/**
 * Provider abstraction (TRI-27): one interface, swappable LLM backends.
 * Roles, not models, are the unit of selection — routes ask for a role and the
 * registry decides which provider+model serves it. This is what lets the M6
 * eval swap Claude for an open-weight backend without rewrites.
 *
 * Server-only: every implementation must throw if constructed in a browser.
 */

export type ChatRole = "reasoning" | "classification";

export interface ChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

export interface CompleteOptions {
  system?: string;
  messages: ChatMessageInput[];
  maxTokens?: number;
  /** JSON Schema — when set, the provider must return schema-valid JSON text. */
  jsonSchema?: Record<string, unknown>;
}

export interface StreamOptions {
  system?: string;
  messages: ChatMessageInput[];
  maxTokens?: number;
}

export interface ChatProvider {
  readonly name: string;
  /** Model id used for the given role — surfaced in logs/eval results. */
  modelFor(role: ChatRole): string;
  complete(role: ChatRole, opts: CompleteOptions): Promise<string>;
  /** Yields text deltas. */
  stream(role: ChatRole, opts: StreamOptions): AsyncIterable<string>;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  /** Returns one unit-normalised vector per input text. */
  embed(texts: string[]): Promise<number[][]>;
}

export function assertServerOnly(what: string): void {
  if (typeof window !== "undefined") {
    throw new Error(`${what} must never run in the browser`);
  }
}
