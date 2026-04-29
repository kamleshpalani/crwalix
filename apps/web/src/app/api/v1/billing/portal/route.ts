/**
 * POST /api/v1/billing/portal — create Stripe customer portal session.
 *
 * Generates a time-limited URL where the user can manage their subscription,
 * update payment methods, view invoices, etc. The portal is hosted by Stripe.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@crawlix/db";
import { createPortalSession } from "@crawlix/billing";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { stripeCustomerId: true },
  });

  if (!org?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer for this organization" },
      { status: 400 },
    );
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "http://localhost:3000";
  const returnUrl = `${appUrl}/settings/billing`;

  const session = await createPortalSession({
    customerId: org.stripeCustomerId,
    returnUrl,
  });

  return NextResponse.json({ url: session.url }, { status: 200 });
}
