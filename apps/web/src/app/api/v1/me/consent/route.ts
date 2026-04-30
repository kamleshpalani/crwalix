/**
 * POST /api/v1/me/consent — record a consent acceptance or revocation.
 * GET  /api/v1/me/consent — list the current user's consent records.
 *
 * Body for POST:
 *   { kind: "tos" | "privacy" | "marketing" | "data_processing",
 *     policyVersion: string,
 *     accepted: boolean }
 *
 * Each call creates a new append-only row. Revocations are represented as
 * accepted=false (i.e. marketing opt-out).
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { prisma } from "@crawlix/db";

export const runtime = "nodejs";

const ConsentSchema = z.object({
  kind: z.enum(["tos", "privacy", "marketing", "data_processing"]),
  policyVersion: z.string().min(1).max(30),
  accepted: z.boolean().default(true),
});

export async function GET(_req: NextRequest) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const records = await prisma.consentRecord.findMany({
    where: { organizationId: ctx.orgId, userId: ctx.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      policyVersion: true,
      accepted: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ records });
}

export async function POST(req: NextRequest) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = ConsentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", issues: parsed.error.issues } },
      { status: 400 },
    );
  }

  // Capture IP and user-agent for tamper-evidence.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const userAgent = req.headers.get("user-agent") ?? null;

  const record = await prisma.consentRecord.create({
    data: {
      organizationId: ctx.orgId,
      userId: ctx.userId,
      kind: parsed.data.kind,
      policyVersion: parsed.data.policyVersion,
      accepted: parsed.data.accepted,
      ip,
      userAgent,
    },
    select: {
      id: true,
      kind: true,
      policyVersion: true,
      accepted: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ record }, { status: 201 });
}
