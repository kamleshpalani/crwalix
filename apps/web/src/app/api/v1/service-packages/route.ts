import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { servicePackagesService } from "@/server/services/service-packages.service";
import { auditService } from "@/server/services/audit.service";

const CreateBody = z.object({
  slug: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(120),
  summary: z.string().max(280).nullable().optional(),
  description: z.string().max(20000).nullable().optional(),
  category: z.string().max(60).nullable().optional(),
  priceCents: z.number().int().min(0).max(1_000_000_000),
  currency: z.string().length(3).optional(),
  billingCycle: z.enum(["ONE_TIME", "MONTHLY", "YEARLY"]).optional(),
  features: z.array(z.string().max(200)).max(30).optional(),
  deliverables: z.array(z.string().max(200)).max(30).optional(),
  scopeItems: z.array(z.string().max(200)).max(30).optional(),
  deliveryDays: z.number().int().min(0).max(3650).nullable().optional(),
  active: z.boolean().optional(),
  position: z.number().int().min(0).max(10000).optional(),
});

export async function GET(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const url = new URL(req.url);
  const activeOnly = url.searchParams.get("active") === "1";
  const packages = await servicePackagesService.list(ctx.orgId, { activeOnly });
  return NextResponse.json({ packages });
}

export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }
  const created = await servicePackagesService.create(
    ctx.orgId,
    ctx.userId,
    parsed.data,
  );
  void auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "service_package.create",
    target: created.id,
    metadata: { slug: created.slug, name: created.name },
  });
  return NextResponse.json({ package: created }, { status: 201 });
}
