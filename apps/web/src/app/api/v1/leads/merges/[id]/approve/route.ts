import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { leadsService } from "@/server/services/leads.service";
import { auditService } from "@/server/services/audit.service";

export const runtime = "nodejs";

/**
 * POST /api/v1/leads/merges/[id]/approve
 * Folds the pending lead into the canonical lead and deletes the duplicate.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx)) {
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  }
  const result = await leadsService.approveMerge(
    ctx.orgId,
    params.id,
    ctx.userId,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: { code: result.error } },
      { status: 404 },
    );
  }
  void auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "lead.merge_approve",
    target: params.id,
    metadata: { canonicalLeadId: result.canonicalLeadId },
  });
  return NextResponse.json(result);
}
