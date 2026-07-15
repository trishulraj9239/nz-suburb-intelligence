import { anthropicProvider } from "./anthropic";
import { geminiEmbeddings } from "./gemini";
import { groqProvider } from "./groq";
import type { ChatProvider, EmbeddingProvider } from "./types";

/**
 * Provider registry (TRI-27). Chat backends are swappable via LLM_PROVIDER (or a
 * per-request override — see getChat) — the M6 eval (TRI-31) added the open-weight
 * Groq provider here with zero changes at the call sites. Embeddings are pinned to
 * Gemini per the TRI-11 lock and are deliberately NOT switchable by env (a silent
 * embedding-model swap would desync the stored vectors).
 */

const chatProviders: Record<string, ChatProvider> = {
  anthropic: anthropicProvider,
  groq: groqProvider,
};

/**
 * Resolve the chat provider. Precedence: explicit `name` (the per-request
 * override the eval uses to A/B providers) → LLM_PROVIDER env → "anthropic".
 * An unknown name throws — it can only ever select among registered providers,
 * so accepting it from the request body is safe.
 */
export function getChat(name?: string): ChatProvider {
  const key = name ?? process.env.LLM_PROVIDER ?? "anthropic";
  const provider = chatProviders[key];
  if (!provider) {
    throw new Error(
      `Unknown chat provider "${key}" (known: ${Object.keys(chatProviders).join(", ")})`,
    );
  }
  return provider;
}

export function getEmbeddings(): EmbeddingProvider {
  return geminiEmbeddings;
}

export type { ChatProvider, ChatRole, EmbeddingProvider } from "./types";
