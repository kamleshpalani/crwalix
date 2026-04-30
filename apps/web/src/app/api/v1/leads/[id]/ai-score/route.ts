/**
 * POST /api/v1/leads/[id]/ai-score
 *
 * Triggers an on-demand AI scoring pass for a lead and persists the result.
 *
 * Returns: {
 *   score: number,      // 0-100
 *   tier: string,       // CRITICAL | HIGH | MEDIUM | LOW
 *   reasoning: string,
 *   usage: {...}
 * }
 */
import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { prisma } from "@crawlix/db";
import { scoreLeadWithAi } from "@crawlix/ai";
import { auditService } from "@/server/services/audit.service";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, organizationId: ctx.orgId },
    select: {
      id: true,
      name: true,
      categoryPrimary: true,
      city: true,
      country: true,
      website: true,
      websiteStatus: true,
      phone: true,
      email: true,
      rating: true,
      reviewCount: true,
      score: true,
      tags: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const result = await scoreLeadWithAi({
    organizationId: ctx.orgId,
    lead: {
      name: lead.name,
      category: lead.categoryPrimary,
      city: lead.city,
      country: lead.country,
      website: lead.website,
      websiteStatus: lead.websiteStatus,
      phone: lead.phone,
      email: lead.email,
      rating: lead.rating,
      reviewCount: lead.reviewCount,
      score: lead.score,
      tags: lead.tags,
    },
  });

  // Persist AI score back to the lead row
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      aiScore: result.score,
      aiScoreTier: result.tier,
      aiScoreReason: result.reasoning,
      aiScoredAt: new Date(),
    },
  });

  void auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "lead.ai_score",
    target: lead.id,
    metadata: { score: result.score, tier: result.tier },
  });

  return NextResponse.json({
    score: result.score,
    tier: result.tier,
    reasoning: result.reasoning,
    usage: result.usage,
    provider: result.provider,
    model: result.model,
  });
}
