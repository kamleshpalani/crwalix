/**
 * POST /api/v1/billing/checkout — create a Stripe Checkout session for
 * subscribing to a paid plan.
 *
 * Body: { priceId: string }
 *
 * Creates (or reuses) a Stripe Customer for the org, then creates a
 * Checkout session in `subscription` mode. Returns { url } which the
 * client should redirect to.
 *
 * On success Stripe redirects to /settings/billing?session={CHECKOUT_SESSION_ID}
 * The existing billing webhook handles `checkout.session.completed` and
 * `customer.subscription.created` to sync the org's subscription record.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@crawlix/db";
import { stripe, createCustomer } from "@crawlix/billing";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { priceId } = body as { priceId?: string };
  if (!priceId) {
    return NextResponse.json(
      { error: { code: "PRICE_ID_REQUIRED" } },
      { status: 400 },
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: {
      id: true,
      name: true,
      stripeCustomerId: true,
      subscription: { select: { stripeSubscriptionId: true, status: true } },
    },
  });

  if (!org) {
    return NextResponse.json(
      { error: { code: "ORG_NOT_FOUND" } },
      { status: 404 },
    );
  }

  // If already subscribed and active, redirect to portal instead.
  const sub = org.subscription;
  if (sub && ["active", "trialing"].includes(sub.status)) {
    return NextResponse.json(
      { error: { code: "ALREADY_SUBSCRIBED" } },
      { status: 409 },
    );
  }

  // Look up the org owner email for pre-filling Stripe Checkout.
  const orgMember = await prisma.organizationMember.findFirst({
    where: { organizationId: ctx.orgId, role: "OWNER" },
    select: { user: { select: { email: true } } },
  });
  const email = orgMember?.user?.email ?? undefined;

  // Ensure Stripe customer exists.
  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await createCustomer({
      email,
      name: org.name ?? undefined,
      metadata: { organizationId: ctx.orgId },
    });
    customerId = customer.id;
    await prisma.organization.update({
      where: { id: ctx.orgId },
      data: { stripeCustomerId: customerId },
    });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "http://localhost:3000";

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { organizationId: ctx.orgId },
    },
    success_url: `${appUrl}/settings/billing?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/settings/billing`,
  });

  return NextResponse.json({ url: session.url }, { status: 200 });
}
