import { aiComplete } from "./router";
import type { AiCompleteResult } from "./types";

export interface ProposalLeadInput {
  name: string;
  category?: string | null;
  city?: string | null;
  country?: string | null;
  website?: string | null;
  websiteHealth?: string | null;
  websiteHealthScore?: number | null;
  servicePitch?: string[] | null;
  /** Free-form intel summary (from website audit / intel report). */
  intelSummary?: string | null;
}

export interface ProposalOrgInput {
  name: string;
  /** One-line value prop e.g. "We build modern websites for local businesses". */
  pitch?: string | null;
}

export interface DraftProposalArgs {
  organizationId: string;
  org: ProposalOrgInput;
  lead: ProposalLeadInput;
  /** Override target service/offering, e.g. "Website redesign". */
  offering?: string;
}

const SYSTEM = `You are an expert B2B sales engineer writing concise, personalized proposals.
Output a clean self-contained HTML document (no markdown, no <html>/<head> wrapper — just a <section>) with these blocks in order:
1. <h1> headline naming the prospect's business
2. <p> opener that proves you researched them (reference 1–2 specific findings)
3. <h2>Why now</h2> + <ul> with 3–5 issues you observed
4. <h2>What we propose</h2> + <ul> with 3 deliverables
5. <h2>Investment</h2> + a single <p> with a price band (placeholder e.g. "$X–Y")
6. <h2>Next step</h2> + a 1-sentence call to action
Keep total length under 350 words. Never invent specific data not present in the input.`;

function userPrompt(args: DraftProposalArgs): string {
  const { org, lead, offering } = args;
  const findings = [
    lead.website ? `website: ${lead.website}` : "no website on record",
    lead.websiteHealth ? `health: ${lead.websiteHealth}` : null,
    typeof lead.websiteHealthScore === "number"
      ? `score: ${lead.websiteHealthScore}/100`
      : null,
    lead.servicePitch?.length
      ? `recommended pitches: ${lead.servicePitch.join(", ")}`
      : null,
    lead.intelSummary ? `intel: ${lead.intelSummary}` : null,
  ]
    .filter(Boolean)
    .join("\n  - ");

  return [
    `Sender: ${org.name}${org.pitch ? " — " + org.pitch : ""}`,
    `Prospect: ${lead.name}${lead.category ? " (" + lead.category + ")" : ""}` +
      (lead.city || lead.country
        ? ` — ${[lead.city, lead.country].filter(Boolean).join(", ")}`
        : ""),
    `Findings:\n  - ${findings || "(none)"}`,
    offering
      ? `Offering: ${offering}`
      : "Offering: pick the best fit from the recommended pitches.",
  ].join("\n\n");
}

export interface DraftProposalResult {
  html: string;
  usage: AiCompleteResult["usage"];
  provider: AiCompleteResult["provider"];
  model: AiCompleteResult["model"];
}

export async function draftProposal(
  args: DraftProposalArgs,
): Promise<DraftProposalResult> {
  const result = await aiComplete({
    taskKind: "proposal.draft",
    organizationId: args.organizationId,
    temperature: 0.4,
    maxTokens: 1200,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userPrompt(args) },
    ],
  });
  return {
    html: result.text.trim(),
    usage: result.usage,
    provider: result.provider,
    model: result.model,
  };
}
