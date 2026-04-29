// apps/web/src/app/api/v1/outreach/unsubscribe/route.ts
//
// Public unsubscribe endpoint. Honors RFC 8058 one-click via POST and
// also serves a friendly confirmation page on GET (for users clicking
// the footer link in their mail client).
//
// Token format: base64url(`${orgId}:${email}`).hex(hmac-sha256).
// Verified server-side; no DB lookup required to validate authenticity.

import { prisma } from "@crawlix/db";
import { hashEmail, verifyUnsubscribeToken } from "@crawlix/outreach";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSecret(): string | null {
  return process.env.OUTREACH_UNSUBSCRIBE_SECRET ?? null;
}

async function suppress(organizationId: string, email: string): Promise<void> {
  const emailHash = hashEmail(email);
  await prisma.outreachSuppression.upsert({
    where: { organizationId_emailHash: { organizationId, emailHash } },
    update: {},
    create: {
      organizationId,
      emailHash,
      reason: "UNSUBSCRIBE",
      source: "user_link",
    },
  });
  // Best-effort: stamp any in-flight messages as unsubscribed.
  await prisma.outreachMessage.updateMany({
    where: { organizationId, toEmail: email, unsubscribedAt: null },
    data: { unsubscribedAt: new Date() },
  });
}

function htmlPage(title: string, message: string): NextResponse {
  const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font:16px/1.5 system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:48px 16px}
.card{max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{margin:0 0 12px;font-size:20px}
p{margin:0;color:#475569}
</style></head><body>
<div class="card"><h1>${title}</h1><p>${message}</p></div>
</body></html>`;
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function handle(token: string | null): Promise<NextResponse> {
  const secret = getSecret();
  if (!secret) {
    return htmlPage(
      "Unsubscribe unavailable",
      "This server is not configured to process unsubscribe requests. Reply to the original email and we will remove you manually.",
    );
  }
  if (!token) {
    return htmlPage(
      "Invalid link",
      "The unsubscribe link is missing its token.",
    );
  }
  const verified = verifyUnsubscribeToken(token, secret);
  if (!verified) {
    return htmlPage(
      "Invalid or expired link",
      "We couldn't verify this unsubscribe link. Please reply to the original email and we'll remove you manually.",
    );
  }
  try {
    await suppress(verified.organizationId, verified.email);
  } catch (err) {
    console.warn("[outreach.unsubscribe] suppression failed", err);
    return htmlPage(
      "We hit a snag",
      "Something went wrong recording your request. Please reply to the original email so we can remove you manually.",
    );
  }
  return htmlPage(
    "You're unsubscribed",
    "You won't receive any more outreach emails from this sender. It can take up to 24 hours for in-flight messages to stop.",
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token");
  return handle(token);
}

// RFC 8058 one-click unsubscribe — providers POST with empty body to the
// `List-Unsubscribe` URL when the user clicks the mail client's button.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token =
    req.nextUrl.searchParams.get("token") ??
    (await req.formData().catch(() => null))?.get("token")?.toString() ??
    null;
  return handle(token);
}
