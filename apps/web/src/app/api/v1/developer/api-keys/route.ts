/**
 * GET  /api/v1/developer/api-keys — list active keys for the org
 * POST /api/v1/developer/api-keys — create a new API key
 *
 * The plaintext key is returned ONCE on creation and is never stored.
 * Only the SHA-256 hash and a short display prefix are persisted.
 */

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { prisma } from "@crawlix/db";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET — list active API keys
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const keys = await prisma.apiKey.findMany({
    where: { organizationId: ctx.orgId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      lastUsedAt: true,
      createdAt: true,
      createdById: true,
    },
  });

  return NextResponse.json({ keys });
}

// ---------------------------------------------------------------------------
// POST — create a new API key
// ---------------------------------------------------------------------------

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
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

  // Hard-cap: 10 active keys per org to prevent abuse.
  const count = await prisma.apiKey.count({
    where: { organizationId: ctx.orgId, revokedAt: null },
  });
  if (count >= 10) {
    return NextResponse.json(
      {
        error: {
          code: "LIMIT_EXCEEDED",
          message: "Max 10 active API keys per organization",
        },
      },
      { status: 422 },
    );
  }

  // Generate a cryptographically random key.
  const rawBytes = randomBytes(32);
  const randomPart = rawBytes.toString("base64url"); // 43 URL-safe chars
  const plaintext = `ck_live_${randomPart}`;

  // Hash for storage (never store plaintext).
  const keyHash = createHash("sha256").update(plaintext).digest("hex");

  // Short display prefix: first 8 chars of the random portion.
  const keyPrefix = `ck_live_${randomPart.slice(0, 8)}...`;

  const key = await prisma.apiKey.create({
    data: {
      organizationId: ctx.orgId,
      name: parsed.data.name,
      keyHash,
      keyPrefix,
      createdById: ctx.userId,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      createdAt: true,
    },
  });

  // Return the plaintext only once — it is not stored and cannot be recovered.
  return NextResponse.json({ key: { ...key, plaintext } }, { status: 201 });
}
