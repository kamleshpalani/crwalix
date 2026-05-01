import { NextResponse } from "next/server";
import { UpdateActivitySchema } from "@crawlix/shared";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { crmService } from "@/server/services/crm.service";

/**
 * PATCH /api/v1/crm/deals/{id}/activities/{actId}
 * Toggle task completion (isDone), update due date, or edit summary.
 * Restricted to TASK kind activities in practice, but the API is generic.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; actId: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = UpdateActivitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid body",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  const activity = await crmService.updateActivity(
    ctx.orgId,
    params.id,
    params.actId,
    parsed.data,
  );

  if (!activity) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Activity not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ activity });
}
