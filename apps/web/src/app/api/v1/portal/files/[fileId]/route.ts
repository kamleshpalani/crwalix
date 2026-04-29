/**
 * GET /api/v1/portal/files/[fileId]
 *
 * Portal-cookie-authenticated file download. Validates the requested file
 * belongs to the project the portal session has access to, then redirects
 * to a short-lived signed URL.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@crawlix/db";
import {
  decodePortalSession,
  PORTAL_COOKIE_NAME,
} from "@/server/services/portal.service";
import { fileService } from "@/server/services/file.service";

export async function GET(
  _req: Request,
  { params }: { params: { fileId: string } },
) {
  const session = decodePortalSession(cookies().get(PORTAL_COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED" } },
      { status: 401 },
    );
  }

  // Confirm the requested file belongs to the session's project.
  const file = await prisma.projectFile.findFirst({
    where: {
      id: params.fileId,
      projectId: session.projectId,
      organizationId: session.orgId,
    },
    select: { id: true },
  });
  if (!file) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const result = await fileService.createDownloadUrl(session.orgId, file.id);
  if (!result) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  return NextResponse.redirect(result.url);
}
