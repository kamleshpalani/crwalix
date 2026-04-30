/**
 * Stripe webhook handler (Phase 2 billing).
 *
 * Processes incoming Stripe events: subscription lifecycle, invoice paid/failed,
 * payment captured/failed. Verifies signature, enforces idempotency via
 * StripeWebhookEvent table, and syncs state to local DB (Subscription, Invoice,
 * Payment models).
 *
 * Stripe may deliver the same event multiple times — we store event.id before
 * processing to prevent double-charging or double-crediting.
 *
 * Security:
 *  - Stripe signs every webhook with an HMAC. We verify via stripe.webhooks.constructEvent.
 *  - STRIPE_WEBHOOK_SECRET must be set; endpoint returns 401 otherwise.
 *
 * Env:
 *  - STRIPE_WEBHOOK_SECRET (required)
 */

import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma, withOrg } from "@crawlix/db";
import { constructWebhookEvent } from "@crawlix/billing";
import { emitNotification } from "@/server/lib/notify";
import { NotificationKind } from "@/server/services/notification-kinds";
import { publishDomainEvent } from "@/server/lib/domain-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Check if we've already processed this event. Insert if not.
 * Returns true if this is the first time seeing this event.
 */
async function claimIdempotency(eventId: string): Promise<boolean> {
  try {
    await prisma.stripeWebhookEvent.create({
      data: { id: eventId, type: "" },
    });
    return true;
  } catch {
    return false; // already exists
  }
}

/**
 * Sync a Stripe subscription to our local Subscription table.
 */
async function syncSubscription(
  orgId: string,
  stripeSub: Stripe.Subscription,
): Promise<void> {
  await withOrg(orgId, async (tx) => {
    const existing = await tx.subscription.findUnique({
      where: { stripeSubscriptionId: stripeSub.id },
    });

    const data = {
      organizationId: orgId,
      stripeSubscriptionId: stripeSub.id,
      plan: determinePlan(stripeSub),
      status: stripeSub.status,
      currentPeriodEnd: stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000)
        : null,
      cancelAt: stripeSub.cancel_at
        ? new Date(stripeSub.cancel_at * 1000)
        : null,
      metadata: stripeSub.metadata as never,
    };

    if (existing) {
      await tx.subscription.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await tx.subscription.create({ data });
    }
  });
}

/**
 * Map Stripe price id (from subscription.items) to our Plan enum.
 * Falls back to FREE if no match.
 */
function determinePlan(
  stripeSub: Stripe.Subscription,
): "FREE" | "STARTER" | "GROWTH" | "SCALE" {
  const item = stripeSub.items.data[0];
  if (!item) return "FREE";
  const priceId = typeof item.price === "string" ? item.price : item.price.id;

  if (priceId === process.env.STRIPE_PRICE_ID_STARTER) return "STARTER";
  if (priceId === process.env.STRIPE_PRICE_ID_GROWTH) return "GROWTH";
  if (priceId === process.env.STRIPE_PRICE_ID_SCALE) return "SCALE";
  return "FREE";
}

/**
 * Sync a Stripe invoice to our local Invoice table.
 */
async function syncInvoice(
  orgId: string,
  stripeInv: Stripe.Invoice,
): Promise<void> {
  await withOrg(orgId, async (tx) => {
    const existing = await tx.invoice.findUnique({
      where: { stripeInvoiceId: stripeInv.id },
    });

    const mapStatus = (
      s: Stripe.Invoice.Status | null,
    ): "DRAFT" | "OPEN" | "PAID" | "UNCOLLECTIBLE" | "VOID" => {
      if (s === "paid") return "PAID";
      if (s === "open") return "OPEN";
      if (s === "void") return "VOID";
      if (s === "uncollectible") return "UNCOLLECTIBLE";
      return "DRAFT";
    };

    const data = {
      organizationId: orgId,
      stripeInvoiceId: stripeInv.id,
      status: mapStatus(stripeInv.status),
      currency: (stripeInv.currency ?? "usd").toUpperCase(),
      subtotalCents: stripeInv.subtotal ?? 0,
      taxCents: stripeInv.tax ?? 0,
      totalCents: stripeInv.total ?? 0,
      amountPaidCents: stripeInv.amount_paid ?? 0,
      amountDueCents: stripeInv.amount_due ?? 0,
      number: stripeInv.number,
      hostedUrl: stripeInv.hosted_invoice_url,
      pdfUrl: stripeInv.invoice_pdf,
      paidAt:
        stripeInv.status === "paid" && stripeInv.status_transitions?.paid_at
          ? new Date(stripeInv.status_transitions.paid_at * 1000)
          : null,
      voidedAt:
        stripeInv.status === "void" && stripeInv.status_transitions?.voided_at
          ? new Date(stripeInv.status_transitions.voided_at * 1000)
          : null,
      metadata: stripeInv.metadata as never,
    };

    if (existing) {
      await tx.invoice.update({ where: { id: existing.id }, data });
    } else {
      await tx.invoice.create({ data });
    }
  });
}

/**
 * Sync a Stripe PaymentIntent to our local Payment table.
 */
async function syncPayment(
  orgId: string,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  // Look up the related invoice from the PaymentIntent metadata or invoice field.
  const stripeInvoiceId =
    typeof pi.invoice === "string" ? pi.invoice : pi.invoice?.id;
  if (!stripeInvoiceId) {
    console.warn(
      `[webhook] PaymentIntent ${pi.id} has no invoice link; skipping payment sync`,
    );
    return;
  }

  await withOrg(orgId, async (tx) => {
    const localInv = await tx.invoice.findUnique({
      where: { stripeInvoiceId },
      select: { id: true },
    });
    if (!localInv) {
      console.warn(
        `[webhook] Invoice ${stripeInvoiceId} not in local DB; skipping payment sync`,
      );
      return;
    }

    const existing = await tx.payment.findUnique({
      where: { stripePaymentIntentId: pi.id },
    });

    const mapStatus = (
      s: Stripe.PaymentIntent.Status,
    ): "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED" => {
      if (s === "succeeded") return "SUCCEEDED";
      if (s === "canceled") return "CANCELED";
      if (
        s === "requires_payment_method" ||
        s === "requires_confirmation" ||
        s === "processing"
      )
        return "PENDING";
      return "FAILED";
    };

    const data = {
      organizationId: orgId,
      invoiceId: localInv.id,
      stripePaymentIntentId: pi.id,
      stripeChargeId: null,
      status: mapStatus(pi.status),
      currency: (pi.currency ?? "usd").toUpperCase(),
      amountCents: pi.amount ?? 0,
      failureCode: null,
      failureMessage: pi.last_payment_error?.message ?? null,
      refundedCents: 0,
      paidAt:
        pi.status === "succeeded" && pi.created
          ? new Date(pi.created * 1000)
          : null,
      metadata: pi.metadata as never,
    };

    if (existing) {
      await tx.payment.update({ where: { id: existing.id }, data });
    } else {
      await tx.payment.create({ data });
    }
  });
}

/**
 * Extract the organizationId from the Stripe customer. If the customer is
 * only a string ID (not expanded), look up the org via our local DB.
 */
async function extractOrgId(
  customer:
    | string
    | Stripe.Customer
    | Stripe.DeletedCustomer
    | null
    | undefined,
): Promise<string | null> {
  if (!customer) return null;
  if (typeof customer === "string") {
    const org = await prisma.organization.findFirst({
      where: { stripeCustomerId: customer },
      select: { id: true },
    });
    return org?.id ?? null;
  }
  if ("deleted" in customer && customer.deleted) return null;
  // For expanded customers, check metadata first, then look up by Stripe ID.
  const metaOrg =
    (customer.metadata?.organizationId as string | undefined) ?? null;
  if (metaOrg) return metaOrg;
  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: customer.id },
    select: { id: true },
  });
  return org?.id ?? null;
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  const type = event.type;

  // Subscription lifecycle
  if (
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const orgId = await extractOrgId(sub.customer);
    if (!orgId) {
      console.warn(
        `[webhook] subscription ${sub.id} has no orgId in customer metadata`,
      );
      return;
    }
    await syncSubscription(orgId, sub);
    if (type === "customer.subscription.deleted" || sub.cancel_at) {
      void emitNotification({
        organizationId: orgId,
        kind: NotificationKind.SUBSCRIPTION_CANCELED,
        title: "Subscription canceled",
        body: sub.cancel_at
          ? `Will end on ${new Date(sub.cancel_at * 1000).toLocaleDateString()}.`
          : "Subscription has ended.",
        href: "/settings/billing",
        data: { stripeSubscriptionId: sub.id, status: sub.status },
      });
      // §6 domain event — SubscriptionCanceled.
      void publishDomainEvent({
        eventName: "SubscriptionCanceled",
        organizationId: orgId,
        occurredAt: new Date().toISOString(),
        payload: {
          subscriptionId: sub.id,
          canceledAt: sub.cancel_at
            ? new Date(sub.cancel_at * 1000).toISOString()
            : new Date().toISOString(),
        },
      });
    } else if (
      type === "customer.subscription.updated" &&
      sub.status === "active"
    ) {
      void emitNotification({
        organizationId: orgId,
        kind: NotificationKind.SUBSCRIPTION_RENEWED,
        title: "Subscription renewed",
        body: sub.current_period_end
          ? `Active until ${new Date(sub.current_period_end * 1000).toLocaleDateString()}.`
          : "Subscription is active.",
        href: "/settings/billing",
        data: { stripeSubscriptionId: sub.id },
      });
    }
    return;
  }

  // Invoice events
  if (
    type === "invoice.created" ||
    type === "invoice.finalized" ||
    type === "invoice.paid" ||
    type === "invoice.payment_failed" ||
    type === "invoice.voided"
  ) {
    const inv = event.data.object as Stripe.Invoice;
    const orgId = await extractOrgId(inv.customer);
    if (!orgId) {
      console.warn(
        `[webhook] invoice ${inv.id} has no orgId in customer metadata`,
      );
      return;
    }
    await syncInvoice(orgId, inv);
    if (type === "invoice.paid") {
      void emitNotification({
        organizationId: orgId,
        kind: NotificationKind.PAYMENT_RECEIVED,
        title: `Payment received — ${inv.number ?? "invoice"}`,
        body: `${((inv.amount_paid ?? inv.total ?? 0) / 100).toFixed(2)} ${(inv.currency ?? "USD").toUpperCase()} via Stripe.`,
        href: "/invoices",
        data: { stripeInvoiceId: inv.id, number: inv.number ?? null },
      });
      // §6 domain event — InvoicePaid.
      void publishDomainEvent({
        eventName: "InvoicePaid",
        organizationId: orgId,
        occurredAt: new Date().toISOString(),
        payload: {
          invoiceId: inv.id,
          amountCents: inv.amount_paid ?? inv.total ?? 0,
        },
      });
    } else if (type === "invoice.payment_failed") {
      void emitNotification({
        organizationId: orgId,
        kind: NotificationKind.PAYMENT_FAILED,
        title: `Payment failed — ${inv.number ?? "invoice"}`,
        body: `Stripe could not collect ${((inv.amount_due ?? 0) / 100).toFixed(2)} ${(inv.currency ?? "USD").toUpperCase()}.`,
        href: "/invoices",
        data: { stripeInvoiceId: inv.id, number: inv.number ?? null },
      });
    }
    return;
  }

  // PaymentIntent lifecycle
  if (
    type === "payment_intent.succeeded" ||
    type === "payment_intent.payment_failed" ||
    type === "payment_intent.canceled"
  ) {
    const pi = event.data.object as Stripe.PaymentIntent;
    const orgId = await extractOrgId(pi.customer as Stripe.Customer | null);
    if (!orgId) {
      console.warn(
        `[webhook] payment_intent ${pi.id} has no orgId in customer metadata`,
      );
      return;
    }
    await syncPayment(orgId, pi);
    return;
  }

  // Module #15 — Checkout Session for self-hosted invoices.
  // Created via /api/v1/payments/checkout/share/[token]; carries
  // metadata.crawlix_invoice_id to identify the local invoice.
  if (type === "checkout.session.completed") {
    const sess = event.data.object as Stripe.Checkout.Session;
    const invoiceId =
      (sess.metadata?.crawlix_invoice_id as string | undefined) ?? null;
    if (!invoiceId) {
      console.log(
        "[webhook] checkout.session.completed without crawlix_invoice_id",
      );
      return;
    }
    if (sess.payment_status !== "paid") {
      console.log(
        `[webhook] checkout.session ${sess.id} payment_status=${sess.payment_status}`,
      );
      return;
    }
    const inv = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        organizationId: true,
        status: true,
        totalCents: true,
        amountPaidCents: true,
        currency: true,
      },
    });
    if (!inv) {
      console.warn(`[webhook] invoice ${invoiceId} not found`);
      return;
    }
    if (inv.status === "PAID") return;
    const remaining = Math.max(0, inv.totalCents - inv.amountPaidCents);
    await prisma.invoice.update({
      where: { id: inv.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        amountPaidCents: inv.totalCents,
        amountDueCents: 0,
        payments: {
          create: {
            organizationId: inv.organizationId,
            status: "SUCCEEDED",
            currency: inv.currency,
            amountCents: remaining > 0 ? remaining : inv.totalCents,
            stripePaymentIntentId:
              typeof sess.payment_intent === "string"
                ? sess.payment_intent
                : null,
            paidAt: new Date(),
            metadata: {
              source: "stripe_checkout",
              session_id: sess.id,
            } as unknown as object,
          },
        },
      },
    });
    try {
      await prisma.auditLog.create({
        data: {
          organizationId: inv.organizationId,
          action: "invoice.paid_stripe",
          target: inv.id,
          metadata: {
            session_id: sess.id,
            payment_intent:
              typeof sess.payment_intent === "string"
                ? sess.payment_intent
                : null,
          } as unknown as object,
        },
      });
    } catch (err) {
      console.warn("[webhook] audit write failed", err);
    }
    return;
  }

  // Add more event types as needed (charge.refunded, etc.)
  console.log(`[webhook] unhandled event type: ${type}`);
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json(
      { error: "webhook secret not configured" },
      { status: 500 },
    );
  }

  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "missing stripe-signature header" },
      { status: 400 },
    );
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature, secret);
  } catch (err) {
    console.error("[webhook] signature verification failed", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Idempotency check
  const claimed = await claimIdempotency(event.id);
  if (!claimed) {
    console.log(`[webhook] event ${event.id} already processed; ack`);
    return NextResponse.json({ ok: true, replay: true }, { status: 200 });
  }

  try {
    await handleEvent(event);
    // Mark as processed
    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: { type: event.type },
    });
  } catch (err) {
    console.error(`[webhook] failed to handle event ${event.id}`, err);
    // Don't ack to Stripe — let them retry.
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
