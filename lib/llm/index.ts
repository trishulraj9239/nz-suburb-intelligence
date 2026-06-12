import { anthropicProvider } from "./anthropic";
import { geminiEmbeddings } from "./gemini";
import type { ChatProvider, EmbeddingProvider } from "./types";

/**
 * Provider registry (TRI-27). Chat backends are swappable via LLM_PROVIDER —
 * the M6 eval adds an open-weight provider here (e.g. Groq) with zero changes
 * at the call sites. Embeddings are pinned to Gemini per the TRI-11 lock and
 * are deliberately NOT switchable by env (a silent embedding-model swap would
 * desync the stored vectors).
 */

const chatProviders: Record<string, ChatProvider> = {
  anthropic: anthropicProvider,
};

export function getChat(): ChatProvider {
  const name = process.env.LLM_PROVIDER ?? "anthropic";
  const provider = chatProviders[name];
  if (!provider) {
    throw new Error(
      `Unknown LLM_PROVIDER "${name}" (known: ${Object.keys(chatProviders).join(", ")})`,
    );
  }
  return provider;
}

export function getEmbeddings(): EmbeddingProvider {
  return geminiEmbeddings;
}

export type { ChatProvider, ChatRole, EmbeddingProvider } from "./types";
