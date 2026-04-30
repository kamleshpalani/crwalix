/**
 * POST /api/v1/billing/paypal/webhook
 *
 * Receives PayPal webhook events. Verifies the signature against
 * PAYPAL_WEBHOOK_ID, then handles `CHECKOUT.ORDER.APPROVED` (we trigger
 * the capture) and `PAYMENT.CAPTURE.COMPLETED` (we mark the invoice paid
 * and emit notifications).
 *
 * Idempotency: the PayPal event id is stored in the existing
 * `StripeWebhookEvent` table (treating it as a generic "processed" log)
 * to avoid double-processing retries.
 *
 * Env:
 *  - PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET  (auth)
 *  - PAYPAL_WEBHOOK_ID                        (signature verification)
 */

import { NextResponse } from "next/server";
import { paypal } from "@crawlix/billing";
import { prisma, withOrg } from "@crawlix/db";
import { emitNotification } from "@/server/lib/notify";
import { NotificationKind } from "@/server/services/notification-kinds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PayPalEvent {
  id: string;
  event_type: string;
  resource?: {
    id?: string;
    custom_id?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
    amount?: { value?: string; currency_code?: string };
    payer?: { email_address?: string };
  };
}

async function claimIdempotency(eventId: string): Promise<boolean> {
  try {
    await prisma.stripeWebhookEvent.create({
      data: { id: `pp_${eventId}`, type: "paypal" },
    });
    return true;
  } catch {
    return false;
  }
}

async function handleCaptureCompleted(event: PayPalEvent): Promise<void> {
  const r = event.resource;
  if (!r) return;
  const invoiceId = r.custom_id;
  const captureId = r.id;
  const amountCents = r.amount?.value
    ? Math.round(parseFloat(r.amount.value) * 100)
    : 0;
  const currency = r.amount?.currency_code ?? "USD";
  if (!invoiceId || !captureId) return;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, organizationId: true, number: true, totalCents: true },
  });
  if (!invoice) return;

  await withOrg(invoice.organizationId, async (tx) => {
    // Idempotent payment row keyed off the PayPal capture id stored in metadata.
    const existing = await tx.payment.findFirst({
      where: {
        organizationId: invoice.organizationId,
        invoiceId: invoice.id,
        metadata: { path: ["paypalCaptureId"], equals: captureId },
      },
    });
    if (!existing) {
      await tx.payment.create({
        data: {
          organizationId: invoice.organizationId,
          invoiceId: invoice.id,
          status: "SUCCEEDED",
          currency,
          amountCents,
          paidAt: new Date(),
          metadata: {
            provider: "paypal",
            paypalCaptureId: captureId,
            payerEmail: r.payer?.email_address ?? null,
          },
        },
      });
    }
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "PAID", paidAt: new Date() },
    });
  });

  await emitNotification({
    organizationId: invoice.organizationId,
    kind: NotificationKind.PAYMENT_RECEIVED,
    title: invoice.number
      ? `Payment received for invoice ${invoice.number}`
      : "Payment received",
    body: `${(amountCents / 100).toFixed(2)} ${currency} captured via PayPal.`,
    data: {
      invoiceId: invoice.id,
      provider: "paypal",
      captureId,
    },
  }).catch((err) => console.warn("[paypal] notify failed", err));
}

export async function POST(req: Request) {
  const creds = paypal.paypalCredsFromEnv();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!creds || !webhookId) {
    return NextResponse.json(
      { error: { code: "PAYPAL_NOT_CONFIGURED" } },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
  const verified = await paypal.verifyWebhook(creds, {
    body: rawBody,
    headers: req.headers,
    webhookId,
  });
  if (!verified) {
    return NextResponse.json(
      { error: { code: "INVALID_SIGNATURE" } },
      { status: 401 },
    );
  }

  let event: PayPalEvent;
  try {
    event = JSON.parse(rawBody) as PayPalEvent;
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_PAYLOAD" } },
      { status: 400 },
    );
  }

  if (!(await claimIdempotency(event.id))) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      await handleCaptureCompleted(event);
    } else if (event.event_type === "CHECKOUT.ORDER.APPROVED") {
      // Auto-capture approved orders. Safe-by-default: PayPal also lets us
      // capture from the client, so this is the second line of defense.
      const orderId = event.resource?.id;
      if (orderId) {
        await paypal.captureOrder(creds, orderId).catch((err) => {
          console.warn("[paypal] auto-capture failed", err);
        });
      }
    }
    // Other event types (e.g. refunds, disputes) are TODO.
  } catch (err) {
    console.error("[paypal/webhook] handler error", err);
    return NextResponse.json(
      { error: { code: "HANDLER_ERROR" } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
