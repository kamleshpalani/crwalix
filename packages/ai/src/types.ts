/**
 * AI provider + task types shared across the router and task helpers.
 * Keep this file dependency-free so it can be imported anywhere.
 */

export type AiProvider = "openai" | "anthropic";

/** Discrete tasks the router knows how to route. Add cases incrementally. */
export type AiTaskKind =
  | "proposal.draft"
  | "reply.classify"
  | "outreach.email"
  | "report.weekly"
  | "support.answer"
  | "search.parse"
  | "lead.score"
  | "website.audit"
  | "vibe.prospect"
  | "crm.nextAction";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompleteRequest {
  taskKind: AiTaskKind;
  organizationId: string;
  messages: AiMessage[];
  /** Force a provider; otherwise the router picks per task defaults + env. */
  provider?: AiProvider;
  /** Model override (provider-specific id). */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** When set, the response must be parseable JSON. */
  jsonMode?: boolean;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** USD cost estimate using built-in pricing table. */
  costUsd: number;
}

export interface AiCompleteResult {
  text: string;
  provider: AiProvider;
  model: string;
  usage: AiUsage;
}

export class AiProviderError extends Error {
  constructor(
    public provider: AiProvider,
    public cause: unknown,
  ) {
    super(`[${provider}] ${(cause as Error)?.message ?? String(cause)}`);
    this.name = "AiProviderError";
  }
}
