import { NextResponse } from "next/server";
import { UpdateProposalSchema } from "@crawlix/shared";
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
  const proposal = await crmService.getProposal(ctx.orgId, params.id);
  if (!proposal) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Proposal not found" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ proposal });
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
  const parsed = UpdateProposalSchema.safeParse(body);
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
    const updated = await crmService.updateProposal(
      ctx.orgId,
      ctx.userId,
      params.id,
      parsed.data,
    );
    if (!updated) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Proposal not found" } },
        { status: 404 },
      );
    }
    return NextResponse.json({ proposal: updated });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_TRANSITION",
          message: err instanceof Error ? err.message : "Update failed",
        },
      },
      { status: 409 },
    );
  }
}
