import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin, isResponse, isAuthError } from "@/lib/auth";
import { prisma } from "@crawlix/db";
import { auditService } from "@/server/services/audit.service";

/** Section 6.2 — Super Admin: list / update tenants (Organizations). */
export async function GET(req: Request) {
  const ctx = await requireSuperAdmin();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as
    | "ACTIVE"
    | "SUSPENDED"
    | "PENDING"
    | "DELETED"
    | null;
  const q = url.searchParams.get("q") ?? undefined;
  const limit = Math.min(
    500,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10)),
  );

  const organizations = await prisma.organization.findMany({
    where: {
      status: status ?? undefined,
      OR: q
        ? [
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
            { companyEmail: { contains: q, mode: "insensitive" } },
          ]
        : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      slug: true,
      name: true,
      plan: true,
      status: true,
      billingStatus: true,
      companyEmail: true,
      country: true,
      aiUsageLimit: true,
      leadSearchLimit: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ organizations });
}

const Patch = z.object({
  organizationId: z.string().uuid(),
  status: z.enum(["ACTIVE", "SUSPENDED", "PENDING", "DELETED"]).optional(),
  billingStatus: z
    .enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELED", "NONE"])
    .optional(),
  plan: z.enum(["FREE", "STARTER", "GROWTH", "SCALE"]).optional(),
  aiUsageLimit: z.number().int().min(0).nullish(),
  leadSearchLimit: z.number().int().min(0).nullish(),
});

export async function PATCH(req: Request) {
  const ctx = await requireSuperAdmin();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON" } },
      { status: 400 },
    );
  }
  const parsed = Patch.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (k === "organizationId") continue;
    if (v !== undefined) data[k] = v;
  }
  const organization = await prisma.organization.update({
    where: { id: parsed.data.organizationId },
    data,
    select: {
      id: true,
      name: true,
      status: true,
      billingStatus: true,
      plan: true,
      aiUsageLimit: true,
      leadSearchLimit: true,
    },
  });
  await auditService.record({
    orgId: organization.id,
    userId: ctx.userId,
    action: "admin.organization_update",
    target: organization.id,
    metadata: data,
  });
  return NextResponse.json({ organization });
}
