import { NextResponse } from "next/server";
import { PatchLeadSchema } from "@crawlix/shared";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { leadsService } from "@/server/services/leads.service";
import { auditService } from "@/server/services/audit.service";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const lead = await leadsService.get(ctx.orgId, params.id);
  if (!lead) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Lead not found" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ lead });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }
  const parsed = PatchLeadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid patch",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }
  const updated = await leadsService.patchLead(
    ctx.orgId,
    params.id,
    parsed.data,
  );
  if (!updated) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Nothing to update" } },
      { status: 404 },
    );
  }
  void auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "lead.patch",
    target: params.id,
    metadata: parsed.data as unknown as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true });
}
