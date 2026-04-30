import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { prisma } from "@crawlix/db";
import { auditService } from "@/server/services/audit.service";

const Patch = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  companyEmail: z.string().email().nullish(),
  companyPhone: z.string().trim().max(40).nullish(),
  website: z.string().url().nullish(),
  addressLine1: z.string().trim().max(200).nullish(),
  addressLine2: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(120).nullish(),
  state: z.string().trim().max(120).nullish(),
  postalCode: z.string().trim().max(40).nullish(),
  country: z.string().trim().max(120).nullish(),
});

const SELECT = {
  id: true,
  slug: true,
  name: true,
  plan: true,
  status: true,
  billingStatus: true,
  companyEmail: true,
  companyPhone: true,
  website: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  aiUsageLimit: true,
  leadSearchLimit: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Section 6.2 — tenant (Organization) profile. */
export async function GET() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const organization = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: SELECT,
  });
  return NextResponse.json({ organization });
}

export async function PATCH(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  // Owners/Admins only — Clerk role string is "admin" / "basic_member" by default,
  // org-level Role enum allows OWNER/ADMIN/MEMBER. Treat anything other than
  // a member-level role as authorized.
  const role = (ctx.role || "").toLowerCase();
  const allowed = role.includes("admin") || role.includes("owner");
  if (!allowed && !ctx.isSuperAdmin) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

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
  // Strip undefined so Prisma doesn't overwrite fields the client omitted.
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) data[k] = v ?? null;
  }
  const organization = await prisma.organization.update({
    where: { id: ctx.orgId },
    data,
    select: SELECT,
  });
  await auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "organization.profile_update",
    target: ctx.orgId,
    metadata: { fields: Object.keys(data) },
  });
  return NextResponse.json({ organization });
}
