/**
 * Inbound webhook for third-party lead pushes.
 *
 * POST /api/v1/leads/webhook
 *
 * Auth: Bearer token = org API key (same auth used by machine clients).
 *   Alternatively, HMAC-SHA256 signature in X-Crawlix-Signature header
 *   using the org's webhookSecret stored in the Integration table.
 *
 * Body: single CreateLeadInput OR array of CreateLeadInput objects.
 *   Accepts up to 500 leads per request.
 *
 * Dedup rules follow Section 7.4 — merged rows are not charged against quota.
 */
import { NextResponse } from "next/server";
import { CreateLeadSchema } from "@crawlix/shared";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { leadsService } from "@/server/services/leads.service";
import { auditService } from "@/server/services/audit.service";
import { prisma } from "@crawlix/db";

export const runtime = "nodejs";

const MAX_BATCH = 500;

const WebhookBodySchema = z.union([
  CreateLeadSchema,
  z.array(CreateLeadSchema).max(MAX_BATCH),
]);

/**
 * Verify HMAC-SHA256 signature when the caller includes
 * X-Crawlix-Signature: sha256=<hex>.
 * Returns true if valid, false if invalid, null if no signature header.
 */
async function verifyHmac(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean | null> {
  if (!signatureHeader) return null;
  const match = signatureHeader.match(/^sha256=([0-9a-f]+)$/i);
  if (!match) return false;
  const expected = match[1];
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time comparison
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const url = new URL(req.url);
  const source = url.searchParams.get("source") ?? "webhook";

  // Optional HMAC verification — look up the org's webhook secret
  const signatureHeader = req.headers.get("x-crawlix-signature");
  if (signatureHeader) {
    const integration = await prisma.integration.findFirst({
      where: {
        organizationId: ctx.orgId,
        provider: "webhook",
        status: "CONNECTED",
      },
      select: { credentials: true },
    });
    const secret = (integration?.credentials as Record<string, string> | null)
      ?.webhookSecret;
    if (!secret) {
      return NextResponse.json(
        {
          error: {
            code: "WEBHOOK_NOT_CONFIGURED",
            message:
              "No webhook secret configured. Connect the webhook integration first.",
          },
        },
        { status: 403 },
      );
    }
    const rawBody = await req.text();
    const valid = await verifyHmac(rawBody, signatureHeader, secret);
    if (!valid) {
      return NextResponse.json(
        { error: { code: "INVALID_SIGNATURE", message: "HMAC mismatch" } },
        { status: 401 },
      );
    }
    // Re-parse from the already-consumed text
    let parsed: ReturnType<typeof WebhookBodySchema.safeParse>;
    try {
      parsed = WebhookBodySchema.safeParse(JSON.parse(rawBody));
    } catch {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
        { status: 400 },
      );
    }
    return processPayload(ctx, parsed, source);
  }

  // No HMAC — parse body normally
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const parsed = WebhookBodySchema.safeParse(raw);
  return processPayload(ctx, parsed, source);
}

async function processPayload(
  ctx: { orgId: string; userId: string },
  parsed: ReturnType<typeof WebhookBodySchema.safeParse>,
  source: string,
) {
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid lead payload",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  const leads = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  let created = 0;
  let merged = 0;
  let failed = 0;

  await Promise.allSettled(
    leads.map(async (leadData) => {
      try {
        const result = await leadsService.create(ctx.orgId, leadData, {
          mode: "merge",
          createdByUserId: ctx.userId,
        });
        if (result.created) created++;
        else merged++;
      } catch {
        failed++;
      }
    }),
  );

  void auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "lead.webhook_ingest",
    target: source,
    metadata: { source, total: leads.length, created, merged, failed },
  });

  return NextResponse.json({ created, merged, failed, total: leads.length });
}
