// apps/web/src/server/services/invoice.service.ts
//
// Module #14 — Self-hosted customer invoicing.
//
// Manages invoices created in-app (status DRAFT → OPEN → PAID/VOID).
// Stripe-derived invoices created by the billing webhook coexist; this service
// only operates on in-app invoices identified by `stripeInvoiceId === null`.
//
// Module #15 attaches Stripe Checkout to OPEN invoices for online payment;
// this service exposes `markPaid` for manual reconciliation (bank transfer etc).

import { withOrg } from "@crawlix/db";
import { randomBytes } from "node:crypto";
import { emitNotification } from "@/server/lib/notify";
import { auditService } from "./audit.service";
import { NotificationKind } from "./notification-kinds";

export type InvoiceStatus =
  | "DRAFT"
  | "OPEN"
  | "PAID"
  | "UNCOLLECTIBLE"
  | "VOID";

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
}

export interface InvoiceDto {
  id: string;
  number: string | null;
  title: string | null;
  status: InvoiceStatus;
  currency: string;
  customerName: string | null;
  customerEmail: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  memo: string | null;
  lineItems: InvoiceLine[];
  dueAt: string | null;
  sentAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
  shareToken: string | null;
  dealId: string | null;
  projectId: string | null;
  stripeInvoiceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceCreateInput {
  title?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  currency?: string;
  memo?: string | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitCents: number;
  }>;
  taxRatePct?: number; // optional pct e.g. 7 for 7%
  dueAt?: string | null;
  dealId?: string | null;
  projectId?: string | null;
}

interface RawInvoice {
  id: string;
  number: string | null;
  title: string | null;
  status: string;
  currency: string;
  customerName: string | null;
  customerEmail: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  memo: string | null;
  lineItems: unknown;
  dueAt: Date | null;
  sentAt: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
  shareToken: string | null;
  dealId: string | null;
  projectId: string | null;
  stripeInvoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(inv: RawInvoice): InvoiceDto {
  return {
    id: inv.id,
    number: inv.number,
    title: inv.title,
    status: inv.status as InvoiceStatus,
    currency: inv.currency,
    customerName: inv.customerName,
    customerEmail: inv.customerEmail,
    subtotalCents: inv.subtotalCents,
    taxCents: inv.taxCents,
    totalCents: inv.totalCents,
    amountPaidCents: inv.amountPaidCents,
    amountDueCents: inv.amountDueCents,
    memo: inv.memo,
    lineItems: Array.isArray(inv.lineItems)
      ? (inv.lineItems as InvoiceLine[])
      : [],
    dueAt: inv.dueAt ? inv.dueAt.toISOString() : null,
    sentAt: inv.sentAt ? inv.sentAt.toISOString() : null,
    paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
    voidedAt: inv.voidedAt ? inv.voidedAt.toISOString() : null,
    hostedUrl: inv.hostedUrl,
    pdfUrl: inv.pdfUrl,
    shareToken: inv.shareToken,
    dealId: inv.dealId,
    projectId: inv.projectId,
    stripeInvoiceId: inv.stripeInvoiceId,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  };
}

function compute(input: InvoiceCreateInput) {
  const lines: InvoiceLine[] = input.lineItems.map((l) => {
    const quantity = Math.max(0, Math.round(l.quantity));
    const unitCents = Math.max(0, Math.round(l.unitCents));
    const totalCents = quantity * unitCents;
    return {
      description: l.description.trim().slice(0, 500),
      quantity,
      unitCents,
      totalCents,
    };
  });
  const subtotalCents = lines.reduce((s, l) => s + l.totalCents, 0);
  const taxRate = Math.max(0, input.taxRatePct ?? 0);
  const taxCents = Math.round((subtotalCents * taxRate) / 100);
  const totalCents = subtotalCents + taxCents;
  return { lines, subtotalCents, taxCents, totalCents };
}

async function nextNumber(
  orgId: string,
  tx: {
    invoice: {
      count: (a: { where: { organizationId: string } }) => Promise<number>;
    };
  },
) {
  const n = await tx.invoice.count({ where: { organizationId: orgId } });
  return `INV-${String(n + 1).padStart(4, "0")}`;
}

async function create(
  orgId: string,
  input: InvoiceCreateInput,
  userId?: string,
): Promise<InvoiceDto> {
  return withOrg(orgId, async (tx) => {
    const number = await nextNumber(orgId, tx);
    const { lines, subtotalCents, taxCents, totalCents } = compute(input);
    const created = await tx.invoice.create({
      data: {
        organizationId: orgId,
        number,
        title: input.title?.slice(0, 200) ?? null,
        customerName: input.customerName?.slice(0, 200) ?? null,
        customerEmail: input.customerEmail?.slice(0, 200) ?? null,
        currency: (input.currency ?? "USD").toUpperCase().slice(0, 3),
        memo: input.memo?.slice(0, 2000) ?? null,
        lineItems: lines as unknown as object,
        subtotalCents,
        taxCents,
        totalCents,
        amountDueCents: totalCents,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        dealId: input.dealId ?? null,
        projectId: input.projectId ?? null,
        createdById: userId ?? null,
      },
    });
    return toDto(created);
  });
}

async function update(
  orgId: string,
  id: string,
  input: InvoiceCreateInput,
): Promise<InvoiceDto> {
  return withOrg(orgId, async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: { id, organizationId: orgId },
      select: { status: true, stripeInvoiceId: true },
    });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.stripeInvoiceId) throw new Error("STRIPE_MANAGED");
    if (existing.status !== "DRAFT") throw new Error("NOT_EDITABLE");
    const { lines, subtotalCents, taxCents, totalCents } = compute(input);
    const updated = await tx.invoice.update({
      where: { id },
      data: {
        title: input.title?.slice(0, 200) ?? null,
        customerName: input.customerName?.slice(0, 200) ?? null,
        customerEmail: input.customerEmail?.slice(0, 200) ?? null,
        currency: (input.currency ?? "USD").toUpperCase().slice(0, 3),
        memo: input.memo?.slice(0, 2000) ?? null,
        lineItems: lines as unknown as object,
        subtotalCents,
        taxCents,
        totalCents,
        amountDueCents: totalCents,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        dealId: input.dealId ?? null,
        projectId: input.projectId ?? null,
      },
    });
    return toDto(updated);
  });
}

async function list(orgId: string): Promise<InvoiceDto[]> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx.invoice.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map(toDto);
  });
}

async function get(orgId: string, id: string): Promise<InvoiceDto | null> {
  return withOrg(orgId, async (tx) => {
    const row = await tx.invoice.findFirst({
      where: { id, organizationId: orgId },
    });
    return row ? toDto(row) : null;
  });
}

async function send(orgId: string, id: string): Promise<InvoiceDto> {
  const dto = await withOrg(orgId, async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: { id, organizationId: orgId },
      select: { status: true, shareToken: true, stripeInvoiceId: true },
    });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.stripeInvoiceId) throw new Error("STRIPE_MANAGED");
    if (existing.status !== "DRAFT") throw new Error("NOT_DRAFT");
    const token = existing.shareToken ?? randomBytes(24).toString("hex");
    const updated = await tx.invoice.update({
      where: { id },
      data: { status: "OPEN", sentAt: new Date(), shareToken: token },
    });
    return toDto(updated);
  });
  void emitNotification({
    organizationId: orgId,
    kind: NotificationKind.INVOICE_SENT,
    title: `Invoice ${dto.number ?? ""} sent`.trim(),
    body: `${dto.customerName ?? "Customer"} — ${(dto.totalCents / 100).toFixed(2)} ${dto.currency}`,
    href: `/invoices/${dto.id}`,
    data: { invoiceId: dto.id, number: dto.number },
  });
  void auditService.record({
    orgId,
    action: "invoice.send",
    target: dto.id,
    metadata: { number: dto.number },
  });
  return dto;
}

async function markPaid(
  orgId: string,
  id: string,
  args: { method?: string; reference?: string },
): Promise<InvoiceDto> {
  const dto = await withOrg(orgId, async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: { id, organizationId: orgId },
      select: {
        status: true,
        totalCents: true,
        amountPaidCents: true,
        currency: true,
      },
    });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.status === "PAID") throw new Error("ALREADY_PAID");
    if (existing.status === "VOID") throw new Error("VOIDED");
    const remaining = Math.max(
      0,
      existing.totalCents - existing.amountPaidCents,
    );
    const updated = await tx.invoice.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        amountPaidCents: existing.totalCents,
        amountDueCents: 0,
        payments: {
          create: {
            organizationId: orgId,
            status: "SUCCEEDED",
            currency: existing.currency,
            amountCents: remaining > 0 ? remaining : existing.totalCents,
            paidAt: new Date(),
            metadata: {
              source: "manual",
              method: args.method ?? null,
              reference: args.reference ?? null,
            } as unknown as object,
          },
        },
      },
    });
    return toDto(updated);
  });
  const methodSuffix = args.method ? ` via ${args.method}` : "";
  void emitNotification({
    organizationId: orgId,
    kind: NotificationKind.PAYMENT_RECEIVED,
    title: `Payment received — ${dto.number ?? "invoice"}`,
    body: `${(dto.totalCents / 100).toFixed(2)} ${dto.currency} marked paid${methodSuffix}.`,
    href: `/invoices/${dto.id}`,
    data: { invoiceId: dto.id, method: args.method ?? null },
  });
  return dto;
}

async function voidInvoice(orgId: string, id: string): Promise<InvoiceDto> {
  return withOrg(orgId, async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: { id, organizationId: orgId },
      select: { status: true, stripeInvoiceId: true },
    });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.stripeInvoiceId) throw new Error("STRIPE_MANAGED");
    if (existing.status === "PAID") throw new Error("ALREADY_PAID");
    const updated = await tx.invoice.update({
      where: { id },
      data: { status: "VOID", voidedAt: new Date() },
    });
    return toDto(updated);
  });
}

async function remove(orgId: string, id: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    const existing = await tx.invoice.findFirst({
      where: { id, organizationId: orgId },
      select: { status: true, stripeInvoiceId: true },
    });
    if (!existing) return;
    if (existing.stripeInvoiceId) throw new Error("STRIPE_MANAGED");
    if (existing.status !== "DRAFT") throw new Error("NOT_DRAFT");
    await tx.invoice.delete({ where: { id } });
  });
}

// ---- Public share-token operations ----------------------------------------

async function getByShareToken(token: string): Promise<InvoiceDto | null> {
  const { prisma } = await import("@crawlix/db");
  const row = await prisma.invoice.findFirst({
    where: { shareToken: token },
  });
  return row ? toDto(row) : null;
}

export const invoiceService = {
  create,
  update,
  list,
  get,
  send,
  markPaid,
  voidInvoice,
  remove,
  getByShareToken,
};
