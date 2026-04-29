import { NextResponse } from "next/server";
import { UpdateDealSchema } from "@crawlix/shared";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { crmService } from "@/server/services/crm.service";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const result = await crmService.getDeal(ctx.orgId, params.id);
  if (!result) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Deal not found" } },
      { status: 404 },
    );
  }
  return NextResponse.json(result);
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = UpdateDealSchema.safeParse(body);
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
    const deal = await crmService.updateDeal(
      ctx.orgId,
      ctx.userId,
      params.id,
      parsed.data,
    );
    if (!deal) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Deal not found" } },
        { status: 404 },
      );
    }
    return NextResponse.json({ deal });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Failed to update deal",
        },
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const ok = await crmService.deleteDeal(ctx.orgId, params.id);
  if (!ok) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Deal not found" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
