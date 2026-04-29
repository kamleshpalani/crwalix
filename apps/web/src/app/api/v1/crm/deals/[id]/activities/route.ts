import { NextResponse } from "next/server";
import {
  ActivityListFilterSchema,
  CreateActivitySchema,
} from "@crawlix/shared";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { crmService } from "@/server/services/crm.service";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = ActivityListFilterSchema.safeParse(raw);
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
  const result = await crmService.listActivities(
    ctx.orgId,
    params.id,
    parsed.data.page,
    parsed.data.pageSize,
  );
  return NextResponse.json(result);
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = CreateActivitySchema.safeParse(body);
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
  const activity = await crmService.createActivity(
    ctx.orgId,
    ctx.userId,
    params.id,
    parsed.data,
  );
  if (!activity) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Deal not found" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ activity }, { status: 201 });
}
