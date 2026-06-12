import { assertServerOnly, type EmbeddingProvider } from "./types";

/**
 * Gemini embeddings (TRI-27/TRI-30). Model + dimension are LOCKED per TRI-11:
 * gemini-embedding-001 @ 768 (MRL truncation). Two rules enforced here:
 *  1. Non-3072 outputs are NOT pre-normalised — we re-normalise every vector.
 *  2. The same model+dimension embeds both ingestion content and live queries
 *     (this module is the only embedding path, so the rule holds structurally).
 * GEMINI_API_KEY is server-only.
 */

const MODEL = "gemini-embedding-001";
const DIMENSIONS = 768; // locked, matches suburb_embeddings vector(768)
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;

function normalise(v: number[]): number[] {
  const len = Math.hypot(...v);
  return len === 0 ? v : v.map((x) => x / len);
}

export const geminiEmbeddings: EmbeddingProvider = {
  name: "gemini",
  model: MODEL,
  dimensions: DIMENSIONS,

  async embed(texts: string[]): Promise<number[][]> {
    assertServerOnly("geminiEmbeddings");
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set (server env)");

    // Batch endpoint caps at 100 requests per call.
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 100) {
      const batch = texts.slice(i, i + 100);
      const res = await fetch(`${ENDPOINT}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${MODEL}`,
            content: { parts: [{ text }] },
            outputDimensionality: DIMENSIONS,
          })),
        }),
      });
      if (!res.ok) {
        throw new Error(`Gemini embed failed: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as {
        embeddings: { values: number[] }[];
      };
      for (const e of data.embeddings) out.push(normalise(e.values));
    }
    return out;
  },
};
