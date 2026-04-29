import { prisma } from "@crawlix/db";
import { openaiComplete } from "./providers/openai";
import { anthropicComplete } from "./providers/anthropic";
import { TASK_DEFAULTS } from "./pricing";
import {
  AiProviderError,
  type AiCompleteRequest,
  type AiCompleteResult,
  type AiProvider,
} from "./types";

/**
 * Pick which provider/model to use for a request.
 * Order: explicit override → task default → fallback to whichever has an API key.
 */
function resolveTarget(req: AiCompleteRequest): {
  provider: AiProvider;
  model: string;
} {
  if (req.provider && req.model)
    return { provider: req.provider, model: req.model };
  const def = TASK_DEFAULTS[req.taskKind];
  const provider = req.provider ?? def.provider;
  const model = req.model ?? def.model;
  return { provider, model };
}

function fallbackProvider(p: AiProvider): AiProvider {
  return p === "openai" ? "anthropic" : "openai";
}

function fallbackModelFor(p: AiProvider): string {
  return p === "openai" ? "gpt-4o-mini" : "claude-3-5-haiku-latest";
}

async function callProvider(
  req: AiCompleteRequest,
  provider: AiProvider,
  model: string,
): Promise<AiCompleteResult> {
  return provider === "openai"
    ? openaiComplete(req, model)
    : anthropicComplete(req, model);
}

/**
 * Persist token usage + estimated USD cost to the existing UsageLog table
 * so per-org spend dashboards / budget enforcement can read from one place.
 */
async function recordUsage(
  req: AiCompleteRequest,
  result: AiCompleteResult,
): Promise<void> {
  try {
    await prisma.usageLog.create({
      data: {
        organizationId: req.organizationId,
        kind: `ai.${req.taskKind}`,
        units: result.usage.totalTokens,
        metadata: {
          provider: result.provider,
          model: result.model,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          costUsd: result.usage.costUsd,
        },
      },
    });
  } catch {
    // Usage logging must never break the AI call.
  }
}

/**
 * Single entrypoint for all LLM calls.
 * - Routes by task kind, with optional explicit provider/model override
 * - Falls back to the alternate provider on AiProviderError
 * - Records token usage + estimated cost to UsageLog
 */
export async function aiComplete(
  req: AiCompleteRequest,
): Promise<AiCompleteResult> {
  const target = resolveTarget(req);
  try {
    const result = await callProvider(req, target.provider, target.model);
    await recordUsage(req, result);
    return result;
  } catch (err) {
    if (!(err instanceof AiProviderError)) throw err;
    const altProvider = fallbackProvider(target.provider);
    const altModel = req.model ?? fallbackModelFor(altProvider);
    const result = await callProvider(req, altProvider, altModel);
    await recordUsage(req, result);
    return result;
  }
}
