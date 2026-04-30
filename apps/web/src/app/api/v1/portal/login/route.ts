/**
 * POST /api/v1/portal/login — request magic link by email.
 * Public route. Always returns 200 to prevent email enumeration.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { portalService } from "@/server/services/portal.service";

const Schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST" } },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? `${url.protocol}//${url.host}`;

  // Fire-and-forget pattern: do the work, but mask presence/absence.
  await portalService.requestLoginLink(parsed.data.email, baseUrl).catch(() => {
    // Swallow — we never reveal failures to the caller.
  });

  return NextResponse.json({ ok: true });
}
