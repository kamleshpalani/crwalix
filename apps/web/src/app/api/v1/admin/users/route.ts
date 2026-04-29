import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin, isResponse, isAuthError } from "@/lib/auth";
import { prisma } from "@crawlix/db";
import { auditService } from "@/server/services/audit.service";

/** Section 6.1 — Super Admin: list users. */
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

  const users = await prisma.user.findMany({
    where: {
      status: status ?? undefined,
      OR: q
        ? [
            { email: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ]
        : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      isSuperAdmin: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ users });
}

const Patch = z.object({
  userId: z.string().uuid(),
  status: z.enum(["ACTIVE", "SUSPENDED", "PENDING", "DELETED"]).optional(),
  isSuperAdmin: z.boolean().optional(),
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
  const user = await prisma.user.update({
    where: { id: parsed.data.userId },
    data: {
      status: parsed.data.status,
      isSuperAdmin: parsed.data.isSuperAdmin,
    },
    select: { id: true, email: true, status: true, isSuperAdmin: true },
  });
  await auditService.record({
    orgId: null,
    userId: ctx.userId,
    action: "admin.user_update",
    target: user.id,
    metadata: {
      status: parsed.data.status,
      isSuperAdmin: parsed.data.isSuperAdmin,
    },
  });
  return NextResponse.json({ user });
}
