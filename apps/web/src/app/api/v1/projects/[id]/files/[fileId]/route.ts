/**
 * GET    /api/v1/projects/[id]/files/[fileId] — issue signed download URL
 * DELETE /api/v1/projects/[id]/files/[fileId] — delete file + storage object
 */

import { NextResponse } from "next/server";
import {
  requireOrg,
  isResponse,
  isAuthError,
  hasProjectAccess,
  requireRole,
} from "@/lib/auth";
import { fileService } from "@/server/services/file.service";

export async function GET(
  _req: Request,
  { params }: { params: { id: string; fileId: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const result = await fileService.createDownloadUrl(ctx.orgId, params.fileId);
  if (!result)
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; fileId: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const denied = requireRole(ctx, hasProjectAccess);
  if (denied) return denied;

  const ok = await fileService.remove(ctx.orgId, params.fileId);
  if (!ok)
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ ok: true });
}
