/**
 * POST /api/v1/crm/proposals/[id]/convert-to-invoice
 *
 * Converts an ACCEPTED proposal into a draft invoice using the parent
 * deal's amount + currency. Idempotent: if an invoice already exists
 * pointing to the deal with `metadata.proposalId === id`, returns it.
 *
 * Body (optional):
 *   { dueAt?: string, taxRatePct?: number, customerName?: string,
 *     customerEmail?: string, send?: boolean }
 *
 * If `send=true`, the freshly created invoice is also moved to OPEN
 * (status transition + share token mint) before responding.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@crawlix/db";
import { ProposalStatus } from "@crawlix/shared";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { invoiceService } from "@/server/services/invoice.service";
import { auditService } from "@/server/services/audit.service";

const Body = z
  .object({
    dueAt: z.string().datetime().optional(),
    taxRatePct: z.number().min(0).max(50).optional(),
    customerName: z.string().max(200).optional(),
    customerEmail: z.string().email().max(200).optional(),
    send: z.boolean().optional(),
  })
  .optional();

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body OK */
  }
  const parsed = Body.safeParse(body);
  const args = parsed.success && parsed.data ? parsed.data : {};

  const proposal = await prisma.proposal.findFirst({
    where: { id: params.id, organizationId: ctx.orgId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      version: true,
      dealId: true,
      leadId: true,
    },
  });
  if (!proposal) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  if (proposal.status !== ProposalStatus.ACCEPTED) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_ACCEPTED",
          message: "Only ACCEPTED proposals can be converted to invoices.",
        },
      },
      { status: 409 },
    );
  }

  // Idempotency: if an in-app invoice already references this proposal, return it.
  const existing = await prisma.invoice.findFirst({
    where: {
      organizationId: ctx.orgId,
      dealId: proposal.dealId,
      stripeInvoiceId: null,
      metadata: { path: ["proposalId"], equals: proposal.id },
    },
  });
  if (existing) {
    return NextResponse.json(
      {
        invoice: { id: existing.id, status: existing.status },
        idempotent: true,
      },
      { status: 200 },
    );
  }

  // Pull the deal for amount + currency.
  const deal = await prisma.deal.findFirst({
    where: { id: proposal.dealId, organizationId: ctx.orgId },
    select: { title: true, amountCents: true, currency: true },
  });
  if (!deal) {
    return NextResponse.json(
      { error: { code: "DEAL_NOT_FOUND" } },
      { status: 409 },
    );
  }
  if (deal.amountCents <= 0) {
    return NextResponse.json(
      {
        error: {
          code: "DEAL_AMOUNT_ZERO",
          message:
            "Deal has no amount set. Update the deal value before converting.",
        },
      },
      { status: 409 },
    );
  }

  const description = `${deal.title} (proposal v${proposal.version})`;
  const created = await invoiceService.create(
    ctx.orgId,
    {
      title: deal.title.slice(0, 200),
      currency: deal.currency,
      customerName: args.customerName ?? null,
      customerEmail: args.customerEmail ?? null,
      memo: `Generated from accepted proposal v${proposal.version}.`,
      lineItems: [
        {
          description,
          quantity: 1,
          unitCents: deal.amountCents,
        },
      ],
      taxRatePct: args.taxRatePct,
      dueAt: args.dueAt ?? null,
      dealId: proposal.dealId,
    },
    ctx.userId ?? undefined,
  );

  // Stamp metadata for idempotency lookups on subsequent calls.
  await prisma.invoice.update({
    where: { id: created.id },
    data: {
      metadata: {
        source: "proposal.convert",
        proposalId: proposal.id,
        proposalVersion: proposal.version,
      } as never,
    },
  });

  let final = created;
  if (args.send) {
    try {
      final = await invoiceService.send(ctx.orgId, created.id);
    } catch (err) {
      // Don't fail the conversion if send fails — invoice is already created.
      console.warn("[proposal.convert] send after create failed", err);
    }
  }

  void auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "proposal.convert_to_invoice",
    target: proposal.id,
    metadata: {
      invoiceId: final.id,
      dealId: proposal.dealId,
      sent: !!args.send,
    },
  });

  return NextResponse.json({ invoice: final }, { status: 201 });
}
