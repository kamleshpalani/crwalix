import { NextResponse } from "next/server";
import {
  requireOrg,
  isResponse,
  isAuthError,
  hasSalesAccess,
  requireRole,
} from "@/lib/auth";
import { sequenceService } from "@/server/services/sequence.service";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const denied = requireRole(ctx, hasSalesAccess);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason : undefined;
  const run = await sequenceService.stop(ctx.orgId, params.id, reason);
  return NextResponse.json({ run });
}
