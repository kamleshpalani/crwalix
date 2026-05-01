/**
 * POST /api/v1/leads/[id]/vibe
 *
 * Triggers an on-demand Claude vibe prospecting analysis for a single lead.
 * Enqueues a BullMQ job and returns the job ID immediately (async) OR, if
 * the ?sync=1 query param is passed, runs inline and returns the result
 * directly (useful for single-lead UI buttons).
 *
 * Response (sync mode):
 * {
 *   leadScore: number,
 *   vibe: string,
 *   painPoints: string[],
 *   recommendedService: string,
 *   recommendedPackage: string,
 *   coldEmail: string,
 *   whatsappMessage: string,
 *   callScript: string,
 *   followUpMessage: string,
 *   analyzedAt: string,
 *   aiProvider: string,
 *   aiModel: string,
 * }
 */
import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { prisma } from "@crawlix/db";
import { vibeProspectLead } from "@crawlix/ai";
import { auditService } from "@/server/services/audit.service";

export async function POST(
  req: Request,
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
      websiteClassification: true,
      phone: true,
      rating: true,
      reviewCount: true,
      websiteHealthScore: true,
      businessScale: true,
      digitalPresenceScore: true,
      facebookUrl: true,
      instagramUrl: true,
      isMobileReady: true,
      hasSeoBasics: true,
      hasAnalytics: true,
      hasBookingForm: true,
      hasLeadCaptureForm: true,
      hasContactForm: true,
      hasSchemaMarkup: true,
      techStack: true,
      provider: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  // Cast for fields added in later migrations.
  const l = lead as typeof lead & {
    email?: string | null;
    hasBookingForm?: boolean | null;
    hasLeadCaptureForm?: boolean | null;
    hasContactForm?: boolean | null;
    hasSeoBasics?: boolean | null;
    hasSchemaMarkup?: boolean | null;
    hasAnalytics?: boolean | null;
    isMobileReady?: boolean | null;
    facebookUrl?: string | null;
    instagramUrl?: string | null;
    techStack?: string[] | null;
    websiteClassification?: string | null;
    digitalPresenceScore?: number | null;
  };

  // Get org name for personalised outreach.
  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { name: true },
  });

  const result = await vibeProspectLead({
    organizationId: ctx.orgId,
    agencyName: org?.name ?? null,
    lead: {
      name: lead.name,
      category: lead.categoryPrimary,
      city: lead.city,
      country: lead.country,
      website: lead.website,
      phone: lead.phone,
      email: l.email ?? null,
      rating: lead.rating,
      reviewCount: lead.reviewCount,
      websiteStatus: lead.websiteStatus,
      websiteHealthScore: lead.websiteHealthScore,
      websiteClassification: l.websiteClassification ?? null,
      hasBookingForm: l.hasBookingForm ?? null,
      hasLeadCaptureForm: l.hasLeadCaptureForm ?? null,
      hasContactForm: l.hasContactForm ?? null,
      hasSeoBasics: l.hasSeoBasics ?? null,
      hasSchemaMarkup: l.hasSchemaMarkup ?? null,
      hasAnalytics: l.hasAnalytics ?? null,
      isMobileReady: l.isMobileReady ?? null,
      facebookUrl: l.facebookUrl ?? null,
      instagramUrl: l.instagramUrl ?? null,
      techStack: l.techStack ?? null,
      digitalPresenceScore: l.digitalPresenceScore ?? null,
      businessScale: lead.businessScale,
      source: lead.provider,
    },
  });

  const analyzedAt = new Date().toISOString();

  // Persist to lead.vibeAnalysis JSON column.
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      vibeAnalysis: {
        leadScore: result.leadScore,
        shouldContact: result.shouldContact,
        vibe: result.vibe,
        painPoints: result.painPoints,
        recommendedService: result.recommendedService,
        recommendedPackage: result.recommendedPackage,
        outreachAngle: result.outreachAngle,
        estimatedDealSize: result.estimatedDealSize,
        conversionProbability: result.conversionProbability,
        nextAction: result.nextAction,
        coldEmail: result.coldEmail,
        whatsappMessage: result.whatsappMessage,
        callScript: result.callScript,
        followUpMessage: result.followUpMessage,
        analyzedAt,
        aiProvider: result.provider,
        aiModel: result.model,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        costUsd: result.usage.costUsd,
      } as never,
    },
  });

  auditService.log({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "vibe.prospect",
    resourceType: "lead",
    resourceId: lead.id,
    metadata: {
      leadScore: result.leadScore,
      provider: result.provider,
      model: result.model,
    },
  });

  return NextResponse.json({
    leadScore: result.leadScore,
    shouldContact: result.shouldContact,
    vibe: result.vibe,
    painPoints: result.painPoints,
    recommendedService: result.recommendedService,
    recommendedPackage: result.recommendedPackage,
    outreachAngle: result.outreachAngle,
    estimatedDealSize: result.estimatedDealSize,
    conversionProbability: result.conversionProbability,
    nextAction: result.nextAction,
    coldEmail: result.coldEmail,
    whatsappMessage: result.whatsappMessage,
    callScript: result.callScript,
    followUpMessage: result.followUpMessage,
    analyzedAt,
    aiProvider: result.provider,
    aiModel: result.model,
  });
}

/**
 * GET /api/v1/leads/[id]/vibe
 *
 * Returns the cached vibe analysis stored on the lead row, or 404 if not yet
 * analysed.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, organizationId: ctx.orgId },
    select: { vibeAnalysis: true },
  });

  if (!lead) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  if (!lead.vibeAnalysis) {
    return NextResponse.json(
      { error: { code: "NOT_ANALYSED" } },
      { status: 404 },
    );
  }

  return NextResponse.json(lead.vibeAnalysis);
}
