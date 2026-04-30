import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { leadsService } from "@/server/services/leads.service";
import { auditService } from "@/server/services/audit.service";

export const runtime = "nodejs";

/**
 * POST /api/v1/leads/merges/[id]/reject
 * Marks a pending merge as rejected; both leads remain separate records.
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
  const result = await leadsService.rejectMerge(
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
    action: "lead.merge_reject",
    target: params.id,
  });
  return NextResponse.json(result);
}
