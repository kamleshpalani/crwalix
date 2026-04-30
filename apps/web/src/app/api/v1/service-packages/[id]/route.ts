import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { servicePackagesService } from "@/server/services/service-packages.service";
import { auditService } from "@/server/services/audit.service";

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  summary: z.string().max(280).nullable().optional(),
  description: z.string().max(20000).nullable().optional(),
  category: z.string().max(60).nullable().optional(),
  priceCents: z.number().int().min(0).max(1_000_000_000).optional(),
  currency: z.string().length(3).optional(),
  billingCycle: z.enum(["ONE_TIME", "MONTHLY", "YEARLY"]).optional(),
  features: z.array(z.string().max(200)).max(30).optional(),
  deliverables: z.array(z.string().max(200)).max(30).optional(),
  scopeItems: z.array(z.string().max(200)).max(30).optional(),
  deliveryDays: z.number().int().min(0).max(3650).nullable().optional(),
  active: z.boolean().optional(),
  position: z.number().int().min(0).max(10000).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const pkg = await servicePackagesService.get(ctx.orgId, params.id);
  if (!pkg)
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ package: pkg });
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
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  const updated = await servicePackagesService.update(
    ctx.orgId,
    params.id,
    parsed.data,
  );
  if (!updated)
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  void auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "service_package.update",
    target: updated.id,
    metadata: { fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ package: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const ok = await servicePackagesService.remove(ctx.orgId, params.id);
  if (!ok)
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  void auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "service_package.delete",
    target: params.id,
  });
  return NextResponse.json({ ok: true });
}
