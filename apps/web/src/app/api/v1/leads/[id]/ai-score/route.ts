/**
 * POST /api/v1/leads/[id]/ai-score
 *
 * Triggers an on-demand AI scoring pass for a lead and persists the result.
 *
 * §10.3 Response shape:
 * {
 *   score: number,                  // 0-100
 *   tier: string,                   // CRITICAL | HIGH | MEDIUM | LOW | NOT_RECOMMENDED
 *   reasoning: string,
 *   contactRecommended: boolean,
 *   bestServicePitch: string,
 *   outreachAngle: string,
 *   suggestedPackage: string,
 *   estimatedDealSize: string,
 *   conversionProbability: number,  // 0-100
 *   suggestedNextAction: string,
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
      // §10.2 — Extended audit + enrichment signals for AI scoring
      businessScale: true,
      websiteClassification: true,
      websiteHealthScore: true,
      hasSeoBasics: true,
      hasSchemaMarkup: true,
      hasAnalytics: true,
      hasBookingForm: true,
      hasLeadCaptureForm: true,
      isMobileReady: true,
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
      // §10.2 — Audit signals
      businessScale: (lead as { businessScale?: string | null }).businessScale,
      websiteClassification: (lead as { websiteClassification?: string | null })
        .websiteClassification,
      websiteHealthScore: lead.websiteHealthScore,
      hasSeoBasics: (lead as { hasSeoBasics?: boolean | null }).hasSeoBasics,
      hasSchemaMarkup: (lead as { hasSchemaMarkup?: boolean | null })
        .hasSchemaMarkup,
      hasAnalytics: (lead as { hasAnalytics?: boolean | null }).hasAnalytics,
      hasBookingForm: (lead as { hasBookingForm?: boolean | null })
        .hasBookingForm,
      hasLeadCaptureForm: (lead as { hasLeadCaptureForm?: boolean | null })
        .hasLeadCaptureForm,
      hasMobileViewport: (lead as { isMobileReady?: boolean | null })
        .isMobileReady,
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
    // §10.3 — Sales recommendations
    contactRecommended: result.contactRecommended,
    bestServicePitch: result.bestServicePitch,
    outreachAngle: result.outreachAngle,
    suggestedPackage: result.suggestedPackage,
    estimatedDealSize: result.estimatedDealSize,
    conversionProbability: result.conversionProbability,
    suggestedNextAction: result.suggestedNextAction,
    usage: result.usage,
    provider: result.provider,
    model: result.model,
  });
}
