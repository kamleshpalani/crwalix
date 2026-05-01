/**
 * POST /api/v1/leads/[id]/classify
 *
 * Re-runs the rules-based business-scale classifier against all stored signals
 * for this lead and persists the result.  Optionally accepts a JSON body to
 * update the §11 extended-input fields before reclassifying:
 *
 *   { locationCount?: number, revenueEstimate?: string,
 *     employeeEstimate?: number, linkedinEmployeeRange?: string }
 *
 * Response:
 *   {
 *     scale: string,
 *     confidence: number,
 *     reasoning: string,
 *     signals: Array<{ signal, weight, scale }>,
 *     inputs: { locationCount, revenueEstimate, employeeEstimate, linkedinEmployeeRange }
 *   }
 *
 * GET /api/v1/leads/[id]/classify
 *
 * Returns the current businessScale, confidence, signals, and extended inputs
 * without running any classification.
 */
import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { prisma } from "@crawlix/db";
import { classifyBusinessScale } from "@crawlix/shared";
import { auditService } from "@/server/services/audit.service";
import { z } from "zod";

const classifyBodySchema = z.object({
  locationCount: z.number().int().min(0).max(100_000).nullish(),
  revenueEstimate: z.string().max(100).nullish(),
  employeeEstimate: z.number().int().min(0).max(10_000_000).nullish(),
  linkedinEmployeeRange: z.string().max(50).nullish(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  // Parse optional body — all fields nullable, body itself optional.
  let overrides: z.infer<typeof classifyBodySchema> = {};
  try {
    const text = await req.text();
    if (text.trim()) {
      const parsed = classifyBodySchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", details: parsed.error.issues } },
          { status: 422 },
        );
      }
      overrides = parsed.data;
    }
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON" } },
      { status: 400 },
    );
  }

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, organizationId: ctx.orgId },
    select: {
      id: true,
      name: true,
      categoryPrimary: true,
      categories: true,
      reviewCount: true,
      rating: true,
      websiteHealthScore: true,
      facebookUrl: true,
      instagramUrl: true,
      techStack: true,
      hasSeoBasics: true,
      hasSchemaMarkup: true,
      hasAnalytics: true,
      isMobileReady: true,
      locationCount: true,
      revenueEstimate: true,
      employeeEstimate: true,
      linkedinEmployeeRange: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  // Merge stored values with any user-supplied overrides.
  const locationCount = overrides.locationCount ?? lead.locationCount ?? null;
  const revenueEstimate =
    overrides.revenueEstimate ?? lead.revenueEstimate ?? null;
  const employeeEstimate =
    overrides.employeeEstimate ?? lead.employeeEstimate ?? null;
  const linkedinEmployeeRange =
    overrides.linkedinEmployeeRange ?? lead.linkedinEmployeeRange ?? null;

  const classification = classifyBusinessScale({
    name: lead.name,
    categoryPrimary: lead.categoryPrimary,
    categories: lead.categories,
    reviewCount: lead.reviewCount,
    rating: lead.rating,
    websiteHealthScore: lead.websiteHealthScore,
    hasFacebook: Boolean(lead.facebookUrl),
    hasInstagram: Boolean(lead.instagramUrl),
    technologies: lead.techStack,
    hasSeoBasics: lead.hasSeoBasics,
    hasOgTags: lead.hasSchemaMarkup,
    locationCount,
    revenueEstimate,
    employeeEstimate,
    linkedinEmployeeRange,
  });

  // Persist result and any updated extended-input fields.
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      businessScale: classification.scale,
      businessScaleConfidence: classification.confidence,
      businessScaleSignals: classification as unknown as object,
      // Only update extended inputs if they were explicitly supplied.
      ...(overrides.locationCount !== undefined && {
        locationCount: overrides.locationCount ?? null,
      }),
      ...(overrides.revenueEstimate !== undefined && {
        revenueEstimate: overrides.revenueEstimate ?? null,
      }),
      ...(overrides.employeeEstimate !== undefined && {
        employeeEstimate: overrides.employeeEstimate ?? null,
      }),
      ...(overrides.linkedinEmployeeRange !== undefined && {
        linkedinEmployeeRange: overrides.linkedinEmployeeRange ?? null,
      }),
    },
  });

  void auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "lead.classify",
    resourceType: "lead",
    resourceId: lead.id,
    metadata: {
      scale: classification.scale,
      confidence: classification.confidence,
      hadOverrides: Object.keys(overrides).length > 0,
    },
  });

  return NextResponse.json({
    scale: classification.scale,
    confidence: classification.confidence,
    reasoning: classification.reasoning,
    signals: classification.signals,
    inputs: {
      locationCount,
      revenueEstimate,
      employeeEstimate,
      linkedinEmployeeRange,
    },
  });
}

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
    select: {
      businessScale: true,
      businessScaleConfidence: true,
      businessScaleSignals: true,
      locationCount: true,
      revenueEstimate: true,
      employeeEstimate: true,
      linkedinEmployeeRange: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  return NextResponse.json({
    scale: lead.businessScale,
    confidence: lead.businessScaleConfidence,
    signals:
      (lead.businessScaleSignals as { signals?: unknown[] } | null)?.signals ??
      [],
    reasoning:
      (lead.businessScaleSignals as { reasoning?: string } | null)?.reasoning ??
      null,
    inputs: {
      locationCount: lead.locationCount,
      revenueEstimate: lead.revenueEstimate,
      employeeEstimate: lead.employeeEstimate,
      linkedinEmployeeRange: lead.linkedinEmployeeRange,
    },
  });
}
