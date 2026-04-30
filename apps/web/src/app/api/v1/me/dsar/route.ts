/**
 * GET  /api/v1/me/dsar — list my DSAR requests
 * POST /api/v1/me/dsar — submit a new EXPORT or ERASE request
 *
 * Body for POST: { type: "EXPORT" | "ERASE" }
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { dsarService } from "@/server/services/dsar.service";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const requests = await dsarService.list(ctx.orgId, ctx.userId);
  return NextResponse.json({ requests });
}

const SubmitSchema = z.object({
  type: z.enum(["EXPORT", "ERASE"]),
});

export async function POST(req: NextRequest) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", issues: parsed.error.issues } },
      { status: 400 },
    );
  }

  const result = await dsarService.submit(
    ctx.orgId,
    ctx.userId,
    parsed.data.type,
  );

  if (result.duplicate) {
    return NextResponse.json(
      { error: { code: "DUPLICATE_REQUEST", request: result.request } },
      { status: 409 },
    );
  }

  return NextResponse.json({ request: result.request }, { status: 201 });
}
