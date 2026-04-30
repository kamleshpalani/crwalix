/**
 * DELETE /api/v1/projects/[id]/portal-invites/[accessId] — revoke grant.
 */

import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { portalService } from "@/server/services/portal.service";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; accessId: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const result = await portalService.revoke(ctx.orgId, params.accessId);
  if (result.count === 0)
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ ok: true });
}
