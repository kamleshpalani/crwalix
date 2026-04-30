import { prisma } from "@crawlix/db";
import { draftProposal } from "@crawlix/ai";
import type { GenerateProposalJob } from "@crawlix/shared";
import { logger } from "../lib/logger";

/**
 * crm.generateProposal
 *
 * Reads the deal + originating lead, calls the AI router to draft proposal
 * HTML, and inserts a new Proposal row. Idempotency is left to the caller
 * (passing a stable BullMQ jobId on the producer side).
 */
export async function runGenerateProposal(
  data: GenerateProposalJob,
): Promise<void> {
  const {
    organizationId,
    dealId,
    offering,
    tone,
    priceBand,
    triggeredByUserId,
  } = data;

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, organizationId },
  });
  if (!deal) {
    logger.warn({ dealId, organizationId }, "generateProposal: deal not found");
    return;
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  if (!org) throw new Error(`Organization ${organizationId} not found`);

  const lead = deal.leadId
    ? await prisma.lead.findFirst({
        where: { id: deal.leadId, organizationId },
      })
    : null;

  // Fold any prior intel report findings into a one-line summary the LLM
  // can reference. Intentionally short to keep prompt tokens predictable.
  let intelSummary: string | null = null;
  if (lead) {
    const audit =
      (lead as { websiteAudit?: { summary?: string } | null }).websiteAudit ??
      null;
    intelSummary = audit?.summary ?? null;
  }

  const drafted = await draftProposal({
    organizationId,
    org: { name: org.name },
    lead: {
      name: lead?.name ?? deal.title,
      category: lead?.categoryPrimary ?? null,
      city: lead?.city ?? null,
      country: lead?.country ?? null,
      website: lead?.website ?? null,
      websiteHealth: lead?.websiteHealth ?? null,
      websiteHealthScore: lead?.websiteHealthScore ?? null,
      servicePitch: lead?.servicePitch ?? null,
      intelSummary,
    },
    offering,
    tone,
    priceBand,
  });

  // Bump version number per (org, deal) so revisions are tracked.
  const last = await prisma.proposal.findFirst({
    where: { organizationId, dealId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;

  await prisma.proposal.create({
    data: {
      organizationId,
      dealId,
      leadId: deal.leadId ?? null,
      version,
      status: "READY",
      bodyHtml: drafted.html,
      aiProvider: drafted.provider,
      aiModel: drafted.model,
      aiPromptTokens: drafted.usage.promptTokens,
      aiCompletionTokens: drafted.usage.completionTokens,
      aiCostUsd: drafted.usage.costUsd,
      generatedById: triggeredByUserId ?? null,
    },
  });

  logger.info(
    {
      dealId,
      version,
      tokens: drafted.usage.totalTokens,
      costUsd: drafted.usage.costUsd,
      provider: drafted.provider,
      model: drafted.model,
    },
    "proposal generated",
  );
}
