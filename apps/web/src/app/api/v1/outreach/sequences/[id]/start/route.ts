import { NextResponse } from "next/server";
import { StartSequenceRunInput } from "@crawlix/shared";
import {
  requireOrg,
  isResponse,
  isAuthError,
  hasSalesAccess,
  requireRole,
} from "@/lib/auth";
import { sequenceService } from "@/server/services/sequence.service";
import { rateLimitOrg } from "@/lib/rate-limit";

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

  const limited = await rateLimitOrg(ctx.orgId, "outreach");
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const parsed = StartSequenceRunInput.safeParse({
    ...body,
    sequenceId: params.id,
  });
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
    const run = await sequenceService.start(ctx.orgId, ctx.userId, parsed.data);
    return NextResponse.json({ run }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "start failed",
        },
      },
      { status: 400 },
    );
  }
}
