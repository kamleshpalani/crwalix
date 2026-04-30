/**
 * PATCH /api/v1/projects/[id]/milestones/[milestoneId] — update milestone.
 * DELETE /api/v1/projects/[id]/milestones/[milestoneId] — delete milestone.
 *
 * PATCH is the trigger for auto-invoicing: setting status=COMPLETED on a
 * milestone with autoInvoice=true and amountCents>0 creates a Stripe invoice.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireOrg,
  isResponse,
  isAuthError,
  hasProjectAccess,
  requireRole,
} from "@/lib/auth";
import { milestoneService } from "@/server/services/milestone.service";

const UpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  amountCents: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  autoInvoice: z.boolean().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  position: z.number().int().min(0).optional(),
  status: z
    .enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELED"])
    .optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; milestoneId: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const denied = requireRole(ctx, hasProjectAccess);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", issues: parsed.error.issues } },
      { status: 400 },
    );
  }

  const updated = await milestoneService.update(ctx.orgId, params.milestoneId, {
    ...parsed.data,
    dueAt:
      parsed.data.dueAt === null
        ? null
        : parsed.data.dueAt
          ? new Date(parsed.data.dueAt)
          : undefined,
  });

  if (!updated)
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ milestone: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; milestoneId: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const denied = requireRole(ctx, hasProjectAccess);
  if (denied) return denied;

  const result = await milestoneService.remove(ctx.orgId, params.milestoneId);
  if (result.count === 0)
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ ok: true });
}
