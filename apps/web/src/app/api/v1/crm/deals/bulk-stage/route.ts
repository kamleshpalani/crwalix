/**
 * POST /api/v1/crm/deals/bulk-stage
 *
 * Bulk move multiple deals to a single stage in one round-trip. Each deal
 * still goes through `crmService.updateDeal` so all the side-effects fire
 * (STAGE_CHANGE activity, project kickoff on Won, etc).
 *
 * Body: { dealIds: string[] (1..200), stageId: string }
 * Response: { updated: number, failed: Array<{ id, error }> }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { crmService } from "@/server/services/crm.service";
import { auditService } from "@/server/services/audit.service";

const Body = z.object({
  dealIds: z.array(z.string().uuid()).min(1).max(200),
  stageId: z.string().uuid(),
});

export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }
  const { dealIds, stageId } = parsed.data;

  let updated = 0;
  const failed: Array<{ id: string; error: string }> = [];
  for (const id of dealIds) {
    try {
      const res = await crmService.updateDeal(ctx.orgId, ctx.userId, id, {
        stageId,
      });
      if (res) {
        updated += 1;
      } else {
        failed.push({ id, error: "NOT_FOUND" });
      }
    } catch (err) {
      failed.push({
        id,
        error: err instanceof Error ? err.message : "UPDATE_FAILED",
      });
    }
  }

  void auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "deal.bulk_stage_update",
    target: stageId,
    metadata: {
      requested: dealIds.length,
      updated,
      failed: failed.length,
    },
  });

  return NextResponse.json({ updated, failed }, { status: 200 });
}
