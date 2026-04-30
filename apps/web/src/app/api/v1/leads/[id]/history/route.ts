/**
 * GET /api/v1/leads/[id]/history
 *
 * Returns the field-level change log for a lead, most-recent first.
 * Supports ?field=<fieldName> to filter to a single field.
 * Supports ?limit=<n> (default 100, max 500).
 */
import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { prisma } from "@crawlix/db";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const url = new URL(req.url);
  const field = url.searchParams.get("field") ?? undefined;
  const limit = Math.min(
    500,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10) || 100),
  );

  // Verify the lead belongs to this org
  const lead = await prisma.lead.findFirst({
    where: { id: params.id, organizationId: ctx.orgId },
    select: { id: true },
  });
  if (!lead) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const history = await prisma.leadFieldHistory.findMany({
    where: {
      leadId: params.id,
      organizationId: ctx.orgId,
      ...(field ? { field } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      field: true,
      oldValue: true,
      newValue: true,
      changedBy: true,
      source: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ items: history, total: history.length });
}
