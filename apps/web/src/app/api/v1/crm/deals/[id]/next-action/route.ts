import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { crmService } from "@/server/services/crm.service";

/**
 * GET /api/v1/crm/deals/{id}/next-action
 *
 * Returns an AI-generated next-best-action recommendation for the deal.
 * Analyses the current stage, recent activity timeline, open tasks, and
 * lead context to suggest the single most impactful action the sales rep
 * should take right now.
 *
 * Response: { headline, rationale, action, urgency, messageTemplate, usage }
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const result = await crmService.getNextAction(ctx.orgId, params.id);

  if (!result) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Deal not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json(result);
}
