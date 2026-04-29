import { NextResponse } from "next/server";
import { CreateDealSchema, DealFilterSchema } from "@crawlix/shared";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { crmService } from "@/server/services/crm.service";

export async function GET(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = DealFilterSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid filter",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }
  const result = await crmService.listDeals(ctx.orgId, parsed.data);
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = CreateDealSchema.safeParse(body);
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
    const deal = await crmService.createDeal(
      ctx.orgId,
      ctx.userId,
      parsed.data,
    );
    return NextResponse.json({ deal }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Failed to create deal",
        },
      },
      { status: 400 },
    );
  }
}
