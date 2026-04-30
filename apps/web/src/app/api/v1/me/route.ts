import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { prisma } from "@crawlix/db";

const Patch = z.object({
  firstName: z.string().trim().max(120).nullish(),
  lastName: z.string().trim().max(120).nullish(),
  phone: z.string().trim().max(40).nullish(),
});

/**
 * Section 6.1 — current-user profile.
 * Note: email + password live in Clerk; change them via Clerk's UserProfile.
 */
export async function GET() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      fullName: true,
      phone: true,
      status: true,
      isSuperAdmin: true,
      avatarUrl: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ user });
}

export async function PATCH(req: Request) {
  const ctx = await requireOrg();
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
    where: { id: ctx.userId },
    data: {
      firstName: parsed.data.firstName ?? null,
      lastName: parsed.data.lastName ?? null,
      phone: parsed.data.phone ?? null,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
    },
  });
  return NextResponse.json({ user });
}
