/**
 * POST /api/v1/leads/vibe-bulk
 *
 * Enqueues Claude vibe prospecting for multiple leads at once.
 *
 * Body: { leadIds: string[] }
 * Response: { queued: number, jobId: string }
 */
import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { prisma } from "@crawlix/db";
import { QueueName, JobName } from "@crawlix/shared";
import { enqueue } from "@/lib/queue";
import { auditService } from "@/server/services/audit.service";

const MAX_BULK = 100;

export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const { leadIds } =
    body != null && typeof body === "object" && "leadIds" in body
      ? (body as { leadIds: unknown })
      : { leadIds: undefined };

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "leadIds must be a non-empty array",
        },
      },
      { status: 400 },
    );
  }

  if (leadIds.length > MAX_BULK) {
    return NextResponse.json(
      {
        error: {
          code: "TOO_MANY",
          message: `Maximum ${MAX_BULK} leads per bulk request`,
        },
      },
      { status: 422 },
    );
  }

  const ids = leadIds.filter((id): id is string => typeof id === "string");

  // Verify all leads belong to this org.
  const count = await prisma.lead.count({
    where: { id: { in: ids }, organizationId: ctx.orgId },
  });
  if (count !== ids.length) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Some leads not found" } },
      { status: 403 },
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { name: true },
  });

  const jobId = `vibe-bulk:${ctx.orgId}:${Date.now()}`;
  await enqueue(
    QueueName.VIBE,
    JobName.VIBE_PROSPECT_BULK,
    {
      organizationId: ctx.orgId,
      leadIds: ids,
      agencyName: org?.name ?? null,
      triggeredByUserId: ctx.userId,
    },
    { jobId },
  );

  auditService.log({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "vibe.prospectBulk",
    resourceType: "lead",
    resourceId: null,
    metadata: { count: ids.length, jobId },
  });

  return NextResponse.json({ queued: ids.length, jobId });
}
