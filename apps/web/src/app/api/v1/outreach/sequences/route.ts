import { NextResponse } from "next/server";
import { CreateSequenceInput } from "@crawlix/shared";
import {
  requireOrg,
  isResponse,
  isAuthError,
  hasSalesAccess,
  requireRole,
} from "@/lib/auth";
import { sequenceService } from "@/server/services/sequence.service";

export async function GET() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const sequences = await sequenceService.list(ctx.orgId);
  return NextResponse.json({ sequences });
}

export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const denied = requireRole(ctx, hasSalesAccess);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const parsed = CreateSequenceInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid body",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }
  try {
    const sequence = await sequenceService.create(
      ctx.orgId,
      ctx.userId,
      parsed.data,
    );
    return NextResponse.json({ sequence }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "create failed",
        },
      },
      { status: 400 },
    );
  }
}
