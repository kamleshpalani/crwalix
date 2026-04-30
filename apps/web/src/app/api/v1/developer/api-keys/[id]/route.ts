/**
 * DELETE /api/v1/developer/api-keys/[id] — revoke an API key
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { prisma } from "@crawlix/db";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  // Verify the key belongs to this org before revoking.
  const key = await prisma.apiKey.findFirst({
    where: { id: params.id, organizationId: ctx.orgId, revokedAt: null },
  });

  if (!key) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "API key not found" } },
      { status: 404 },
    );
  }

  await prisma.apiKey.update({
    where: { id: key.id },
    data: { revokedAt: new Date() },
  });

  return new NextResponse(null, { status: 204 });
}
