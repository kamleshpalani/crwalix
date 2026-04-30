// apps/web/src/app/api/v1/leads/[id]/enrichments/route.ts
//
// §8 Lead Enrichment Module — per-lead enrichment endpoints.
//
// GET  /api/v1/leads/:id/enrichments
//   Returns all enrichment rows for a lead plus the §8.2 aggregate status.
//
// POST /api/v1/leads/:id/enrich
//   Queues one or more enrichment kinds for a specific lead.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import {
  enrichmentService,
  computeLeadEnrichmentStatus,
} from "@/server/services/enrichment.service";
import { withOrg } from "@crawlix/db";
import { rateLimitOrg } from "@/lib/rate-limit";
import { auditService } from "@/server/services/audit.service";

// ---------------------------------------------------------------------------
// GET — list enrichments for a lead + aggregate §8.2 status
// ---------------------------------------------------------------------------
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const enrichments = await enrichmentService.list(ctx.orgId, {
    leadId: params.id,
    limit: 200,
  });

  const enrichmentStatus = computeLeadEnrichmentStatus(enrichments);

  return NextResponse.json({ enrichments, enrichmentStatus });
}

// ---------------------------------------------------------------------------
// POST — trigger enrichment for specific kinds on this lead
// ---------------------------------------------------------------------------
const KindEnum = z.enum([
  "WEBSITE_VALIDATION",
  "EMAIL",
  "EMAIL_VERIFY",
  "SOCIAL",
  "COMPANY",
  "CONTACT",
  "BUSINESS_DESCRIPTION",
  "REVIEW_SUMMARY",
  "WEBSITE_REPORT",
]);

const Body = z.object({
  kinds: z.array(KindEnum).min(1).max(8),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const limited = await rateLimitOrg(ctx.orgId, "ai");
  if (limited) return limited;

  // Verify the lead belongs to this org.
  const lead = await withOrg(ctx.orgId, (tx) =>
    tx.lead.findFirst({
      where: { id: params.id, organizationId: ctx.orgId },
      select: { id: true, name: true },
    }),
  );
  if (!lead) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Lead not found" } },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  const results = await enrichmentService.queue(ctx.orgId, {
    leadId: params.id,
    kinds: parsed.data.kinds,
  });

  await auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "enrichment.queue",
    target: params.id,
    metadata: { leadId: params.id, kinds: parsed.data.kinds },
  });

  return NextResponse.json({ results }, { status: 202 });
}
