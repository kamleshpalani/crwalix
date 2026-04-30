/**
 * POST /api/v1/billing/paypal/create-order
 *
 * Creates a PayPal order for the given invoice and returns the approve URL.
 * Caller (server-side) should redirect the customer to `approveUrl`. After
 * PayPal returns to `returnUrl`, the webhook handles capture confirmation.
 *
 * Body: `{ invoiceId: string, returnUrl: string, cancelUrl: string }`
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { paypal } from "@crawlix/billing";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { withOrg } from "@crawlix/db";

const BodySchema = z.object({
  invoiceId: z.string().uuid(),
  returnUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const creds = paypal.paypalCredsFromEnv();
  if (!creds) {
    return NextResponse.json(
      { error: { code: "PAYPAL_NOT_CONFIGURED" } },
      { status: 503 },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_BODY",
          details: err instanceof z.ZodError ? err.flatten() : undefined,
        },
      },
      { status: 400 },
    );
  }

  const invoice = await withOrg(ctx.orgId, (tx) =>
    tx.invoice.findFirst({
      where: { id: body.invoiceId, organizationId: ctx.orgId },
      select: {
        id: true,
        totalCents: true,
        currency: true,
        number: true,
        status: true,
      },
    }),
  );
  if (!invoice) {
    return NextResponse.json(
      { error: { code: "INVOICE_NOT_FOUND" } },
      { status: 404 },
    );
  }
  if (invoice.totalCents <= 0) {
    return NextResponse.json(
      { error: { code: "INVOICE_AMOUNT_ZERO" } },
      { status: 409 },
    );
  }
  if (invoice.status === "PAID") {
    return NextResponse.json(
      { error: { code: "INVOICE_ALREADY_PAID" } },
      { status: 409 },
    );
  }

  try {
    const order = await paypal.createOrder(creds, {
      amountCents: invoice.totalCents,
      currency: invoice.currency,
      customId: invoice.id,
      description: invoice.number ? `Invoice ${invoice.number}` : "Invoice",
      returnUrl: body.returnUrl,
      cancelUrl: body.cancelUrl,
    });
    return NextResponse.json({
      orderId: order.id,
      approveUrl: order.approveUrl,
      status: order.status,
    });
  } catch (err) {
    console.error("[paypal/create-order] failed", err);
    return NextResponse.json(
      { error: { code: "PAYPAL_CREATE_FAILED" } },
      { status: 502 },
    );
  }
}
