import type { AiProvider, AiTaskKind, AiUsage } from "./types";

/**
 * Per-1M-token pricing in USD. Conservative defaults; override via env if needed.
 * Source: provider public pricing pages as of writing.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  // Anthropic
  "claude-3-5-haiku-latest": { input: 0.8, output: 4 },
  "claude-3-5-sonnet-latest": { input: 3, output: 15 },
};

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (promptTokens * p.input + completionTokens * p.output) / 1_000_000;
}

/** Default model per task per provider. */
export const TASK_DEFAULTS: Record<
  AiTaskKind,
  { provider: AiProvider; model: string }
> = {
  "proposal.draft": { provider: "openai", model: "gpt-4o-mini" },
  "reply.classify": { provider: "openai", model: "gpt-4o-mini" },
  "outreach.email": { provider: "openai", model: "gpt-4o-mini" },
  "report.weekly": { provider: "anthropic", model: "claude-3-5-haiku-latest" },
  "support.answer": { provider: "anthropic", model: "claude-3-5-haiku-latest" },
  "search.parse": { provider: "openai", model: "gpt-4o-mini" },
};

export function buildUsage(
  model: string,
  promptTokens: number,
  completionTokens: number,
): AiUsage {
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    costUsd: estimateCostUsd(model, promptTokens, completionTokens),
  };
}
