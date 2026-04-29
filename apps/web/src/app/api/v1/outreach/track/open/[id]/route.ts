// apps/web/src/app/api/v1/outreach/track/open/[id]/route.ts
//
// Public 1×1 GIF beacon. Recipient mailbox fetches this URL when an outreach
// email is opened. We stamp `openedAt` + bump status to OPENED, then return a
// transparent 43-byte GIF so the recipient sees nothing visible.
//
// Failures are silent — we MUST always return the pixel so a logging miss
// never breaks the UX.

import { prisma } from "@crawlix/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1x1 transparent GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function pixelResponse(): NextResponse {
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const msg = await prisma.outreachMessage.findUnique({
      where: { id: params.id },
      select: { id: true, openedAt: true, status: true },
    });
    if (msg && !msg.openedAt) {
      // Only bump status forward — never clobber CLICKED/REPLIED.
      const nextStatus =
        msg.status === "SENT" ||
        msg.status === "DELIVERED" ||
        msg.status === "QUEUED"
          ? "OPENED"
          : msg.status;
      await prisma.outreachMessage.update({
        where: { id: msg.id },
        data: { openedAt: new Date(), status: nextStatus },
      });
    }
  } catch (err) {
    // Beacons must never throw — log and serve the pixel.
    console.warn("[outreach.track.open] failed", err);
  }
  return pixelResponse();
}
