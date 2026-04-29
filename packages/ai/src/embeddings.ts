// packages/ai/src/embeddings.ts
//
// OpenAI text-embedding-3-small (1536 dims). Used by the support agent and
// any other RAG-style features that need semantic similarity. Single-input
// and batch helpers; both return raw Float[]s + token usage.

import OpenAI from "openai";

const EMBED_MODEL = "text-embedding-3-small";
// Per-1M token cost (USD).
const EMBED_PRICE = 0.02;

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  _client = new OpenAI({ apiKey: key });
  return _client;
}

export interface EmbedResult {
  vector: number[];
  usage: { promptTokens: number; totalTokens: number; costUsd: number };
}

export async function embedText(text: string): Promise<EmbedResult> {
  const trimmed = text.trim().slice(0, 8000);
  if (trimmed.length === 0) {
    return {
      vector: [],
      usage: { promptTokens: 0, totalTokens: 0, costUsd: 0 },
    };
  }
  const res = await client().embeddings.create({
    model: EMBED_MODEL,
    input: trimmed,
  });
  const vec = res.data[0]?.embedding ?? [];
  const tokens = res.usage?.total_tokens ?? 0;
  return {
    vector: vec,
    usage: {
      promptTokens: res.usage?.prompt_tokens ?? tokens,
      totalTokens: tokens,
      costUsd: (tokens * EMBED_PRICE) / 1_000_000,
    },
  };
}

/** Cosine similarity for two equal-length vectors. Returns 0 if either is empty. */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
