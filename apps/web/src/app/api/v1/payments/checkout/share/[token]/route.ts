// apps/web/src/app/api/v1/payments/checkout/share/[token]/route.ts
//
// Module #15 — Stripe Checkout Session for a self-hosted invoice's public
// share page. Anyone with the share token can pay; the success_url returns
// to the same share page; the webhook (existing /api/v1/billing/webhook) is
// extended to handle `checkout.session.completed` for invoice metadata.

import { NextResponse } from "next/server";
import { stripe } from "@crawlix/billing";
import { invoiceService } from "@/server/services/invoice.service";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { token: string } },
) {
  const invoice = await invoiceService.getByShareToken(params.token);
  if (!invoice) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  if (invoice.status !== "OPEN" || invoice.amountDueCents <= 0) {
    return NextResponse.json(
      { error: { code: "NOT_PAYABLE" } },
      { status: 409 },
    );
  }
  if (invoice.stripeInvoiceId) {
    return NextResponse.json(
      { error: { code: "STRIPE_MANAGED" } },
      { status: 409 },
    );
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  let session;
  try {
    session = await stripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: invoice.customerEmail ?? undefined,
      line_items: [
        {
          price_data: {
            currency: invoice.currency.toLowerCase(),
            product_data: {
              name: invoice.title ?? `Invoice ${invoice.number ?? invoice.id}`,
              description: invoice.customerName ?? undefined,
            },
            unit_amount: invoice.amountDueCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        crawlix_invoice_id: invoice.id,
        crawlix_invoice_number: invoice.number ?? "",
      },
      success_url: `${origin}/invoices/share/${params.token}?paid=1`,
      cancel_url: `${origin}/invoices/share/${params.token}`,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: {
          code: "STRIPE_ERROR",
          message: e instanceof Error ? e.message : "error",
        },
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ url: session.url, id: session.id });
}
