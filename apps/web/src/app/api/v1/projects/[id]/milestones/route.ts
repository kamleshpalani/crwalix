/**
 * GET /api/v1/projects/[id]/milestones — list milestones for a project.
 * POST /api/v1/projects/[id]/milestones — create a new milestone.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { milestoneService } from "@/server/services/milestone.service";

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  amountCents: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  autoInvoice: z.boolean().optional(),
  dueAt: z.string().datetime().optional(),
  position: z.number().int().min(0).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const items = await milestoneService.list(ctx.orgId, params.id);
  return NextResponse.json({ items });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", issues: parsed.error.issues } },
      { status: 400 },
    );
  }

  const milestone = await milestoneService.create(ctx.orgId, {
    projectId: params.id,
    title: parsed.data.title,
    description: parsed.data.description,
    amountCents: parsed.data.amountCents,
    currency: parsed.data.currency,
    autoInvoice: parsed.data.autoInvoice,
    dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    position: parsed.data.position,
  });

  if (!milestone)
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ milestone }, { status: 201 });
}
