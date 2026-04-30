import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { leadsService } from "@/server/services/leads.service";

export const runtime = "nodejs";

/**
 * GET /api/v1/leads/merges/pending
 * Lists low-confidence dedupe hits awaiting human review (Section 7.4).
 */
export async function GET() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx)) {
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  }
  const items = await leadsService.listPendingMerges(ctx.orgId);
  return NextResponse.json({ ok: true, items });
}
