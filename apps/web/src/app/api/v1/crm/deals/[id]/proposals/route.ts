import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { crmService } from "@/server/services/crm.service";

const BodySchema = z
  .object({
    offering: z.string().min(1).max(500).optional(),
  })
  .optional();

/**
 * POST /api/v1/crm/deals/{id}/proposals
 *
 * Triggers the `crm.generateProposal` worker job for this deal. Returns
 * 202 Accepted with the BullMQ job id; the new Proposal row appears once
 * the worker finishes (drawer polls /api/v1/crm/deals/{id} on refresh).
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body ?? {});
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

  const result = await crmService.generateProposal(
    ctx.orgId,
    ctx.userId,
    params.id,
    parsed.data?.offering,
  );
  if (!result) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Deal not found" } },
      { status: 404 },
    );
  }
  return NextResponse.json(result, { status: 202 });
}
