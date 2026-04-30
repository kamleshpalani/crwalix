// apps/web/src/server/services/quote.service.ts
//
// Module #10 — Quotation & pricing.
//
// Quotes are immutable once SENT. Customers accept/decline via a public
// share token (no auth) — we mint that on send.
//
// Pricing math is server-authoritative: we recompute every line + the
// totals on every save so a malicious client can't smuggle in a wrong
// totalCents.

import { withOrg } from "@crawlix/db";
import { randomBytes } from "node:crypto";

const MAX_LINE_ITEMS = 50;

export interface LineItemInput {
  description: string;
  /** Decimal qty — internally packed as int * 1000. */
  quantity: number;
  unitPriceCents: number;
}

export interface QuoteUpsertInput {
  title: string;
  dealId?: string | null;
  leadId?: string | null;
  projectId?: string | null;
  currency?: string;
  discountCents?: number;
  taxRateBps?: number;
  notes?: string | null;
  terms?: string | null;
  validUntil?: string | null;
  items: LineItemInput[];
}

export interface QuoteDto {
  id: string;
  number: string | null;
  title: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  currency: string;
  subtotalCents: number;
  discountCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  notes: string | null;
  terms: string | null;
  validUntil: string | null;
  shareToken: string | null;
  dealId: string | null;
  leadId: string | null;
  projectId: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: {
    id: string;
    position: number;
    description: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }[];
}

interface RawQuote {
  id: string;
  number: string | null;
  title: string;
  status: string;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  notes: string | null;
  terms: string | null;
  validUntil: Date | null;
  shareToken: string | null;
  dealId: string | null;
  leadId: string | null;
  projectId: string | null;
  sentAt: Date | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lineItems: {
    id: string;
    position: number;
    description: string;
    quantityMilli: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }[];
}

function toDto(q: RawQuote): QuoteDto {
  return {
    id: q.id,
    number: q.number,
    title: q.title,
    status: q.status as QuoteDto["status"],
    currency: q.currency,
    subtotalCents: q.subtotalCents,
    discountCents: q.discountCents,
    taxRateBps: q.taxRateBps,
    taxCents: q.taxCents,
    totalCents: q.totalCents,
    notes: q.notes,
    terms: q.terms,
    validUntil: q.validUntil ? q.validUntil.toISOString() : null,
    shareToken: q.shareToken,
    dealId: q.dealId,
    leadId: q.leadId,
    projectId: q.projectId,
    sentAt: q.sentAt ? q.sentAt.toISOString() : null,
    acceptedAt: q.acceptedAt ? q.acceptedAt.toISOString() : null,
    declinedAt: q.declinedAt ? q.declinedAt.toISOString() : null,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
    items: q.lineItems
      .sort((a, b) => a.position - b.position)
      .map((li) => ({
        id: li.id,
        position: li.position,
        description: li.description,
        quantity: li.quantityMilli / 1000,
        unitPriceCents: li.unitPriceCents,
        lineTotalCents: li.lineTotalCents,
      })),
  };
}

/** Compute per-line totals + summary totals. Server-authoritative. */
function compute(
  items: LineItemInput[],
  discountCents: number,
  taxRateBps: number,
) {
  const cleanedItems = items.slice(0, MAX_LINE_ITEMS).map((it) => {
    const qtyMilli = Math.max(0, Math.round((it.quantity ?? 0) * 1000));
    const unit = Math.max(0, Math.round(it.unitPriceCents ?? 0));
    const lineTotal = Math.round((qtyMilli * unit) / 1000);
    return {
      description: it.description.trim().slice(0, 500),
      quantityMilli: qtyMilli,
      unitPriceCents: unit,
      lineTotalCents: lineTotal,
    };
  });
  const subtotal = cleanedItems.reduce((s, x) => s + x.lineTotalCents, 0);
  const discount = Math.max(
    0,
    Math.min(subtotal, Math.round(discountCents ?? 0)),
  );
  const taxable = subtotal - discount;
  const tax = Math.max(0, Math.round((taxable * (taxRateBps ?? 0)) / 10_000));
  const total = taxable + tax;
  return {
    items: cleanedItems,
    subtotalCents: subtotal,
    discountCents: discount,
    taxRateBps: Math.max(0, Math.round(taxRateBps ?? 0)),
    taxCents: tax,
    totalCents: total,
  };
}

async function nextQuoteNumber(
  orgId: string,
  tx: {
    quote: {
      count: (args: { where: { organizationId: string } }) => Promise<number>;
    };
  },
) {
  const n = await tx.quote.count({ where: { organizationId: orgId } });
  return `Q-${String(n + 1).padStart(4, "0")}`;
}

async function create(
  orgId: string,
  input: QuoteUpsertInput,
  userId?: string,
): Promise<QuoteDto> {
  const totals = compute(
    input.items,
    input.discountCents ?? 0,
    input.taxRateBps ?? 0,
  );
  return withOrg(orgId, async (tx) => {
    const number = await nextQuoteNumber(orgId, tx);
    const created = await tx.quote.create({
      data: {
        organizationId: orgId,
        title: input.title.trim().slice(0, 200),
        dealId: input.dealId ?? null,
        leadId: input.leadId ?? null,
        projectId: input.projectId ?? null,
        currency: (input.currency ?? "USD").slice(0, 3).toUpperCase(),
        notes: input.notes?.slice(0, 4000) ?? null,
        terms: input.terms?.slice(0, 8000) ?? null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        number,
        createdById: userId ?? null,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxRateBps: totals.taxRateBps,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        lineItems: {
          create: totals.items.map((it, idx) => ({
            organizationId: orgId,
            position: idx,
            description: it.description,
            quantityMilli: it.quantityMilli,
            unitPriceCents: it.unitPriceCents,
            lineTotalCents: it.lineTotalCents,
          })),
        },
      },
      include: { lineItems: true },
    });
    return toDto(created);
  });
}

async function update(
  orgId: string,
  id: string,
  input: QuoteUpsertInput,
): Promise<QuoteDto> {
  const totals = compute(
    input.items,
    input.discountCents ?? 0,
    input.taxRateBps ?? 0,
  );
  return withOrg(orgId, async (tx) => {
    const existing = await tx.quote.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, status: true },
    });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.status !== "DRAFT") throw new Error("NOT_EDITABLE");

    await tx.quoteLineItem.deleteMany({
      where: { quoteId: id, organizationId: orgId },
    });
    const updated = await tx.quote.update({
      where: { id },
      data: {
        title: input.title.trim().slice(0, 200),
        dealId: input.dealId ?? null,
        leadId: input.leadId ?? null,
        projectId: input.projectId ?? null,
        currency: (input.currency ?? "USD").slice(0, 3).toUpperCase(),
        notes: input.notes?.slice(0, 4000) ?? null,
        terms: input.terms?.slice(0, 8000) ?? null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxRateBps: totals.taxRateBps,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        lineItems: {
          create: totals.items.map((it, idx) => ({
            organizationId: orgId,
            position: idx,
            description: it.description,
            quantityMilli: it.quantityMilli,
            unitPriceCents: it.unitPriceCents,
            lineTotalCents: it.lineTotalCents,
          })),
        },
      },
      include: { lineItems: true },
    });
    return toDto(updated);
  });
}

async function list(orgId: string): Promise<QuoteDto[]> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx.quote.findMany({
      where: { organizationId: orgId },
      include: { lineItems: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map(toDto);
  });
}

async function get(orgId: string, id: string): Promise<QuoteDto | null> {
  return withOrg(orgId, async (tx) => {
    const row = await tx.quote.findFirst({
      where: { id, organizationId: orgId },
      include: { lineItems: true },
    });
    return row ? toDto(row) : null;
  });
}

async function send(orgId: string, id: string): Promise<QuoteDto> {
  return withOrg(orgId, async (tx) => {
    const existing = await tx.quote.findFirst({
      where: { id, organizationId: orgId },
      select: { status: true, shareToken: true },
    });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.status !== "DRAFT") throw new Error("ALREADY_SENT");
    const token = existing.shareToken ?? randomBytes(24).toString("hex");
    const updated = await tx.quote.update({
      where: { id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        shareToken: token,
      },
      include: { lineItems: true },
    });
    return toDto(updated);
  });
}

async function remove(orgId: string, id: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx.quote.deleteMany({ where: { id, organizationId: orgId } });
  });
}

// ---- Public share-token operations ----------------------------------------
// These are called by the unauthenticated /quotes/share/[token] page.

async function getByShareToken(token: string): Promise<QuoteDto | null> {
  // Need to bypass RLS — this is a public link. We use the privileged prisma
  // client through an unscoped findFirst.
  const { prisma } = await import("@crawlix/db");
  const row = await prisma.quote.findFirst({
    where: {
      shareToken: token,
      status: { in: ["SENT", "ACCEPTED", "DECLINED"] },
    },
    include: { lineItems: true },
  });
  return row ? toDto(row) : null;
}

async function acceptByShareToken(token: string): Promise<QuoteDto | null> {
  const { prisma } = await import("@crawlix/db");
  const existing = await prisma.quote.findFirst({
    where: { shareToken: token },
    select: { id: true, status: true, organizationId: true, validUntil: true },
  });
  if (!existing) return null;
  if (existing.status !== "SENT") return null;
  if (existing.validUntil && existing.validUntil.getTime() < Date.now()) {
    await prisma.quote.update({
      where: { id: existing.id },
      data: { status: "EXPIRED" },
    });
    return null;
  }
  const updated = await prisma.quote.update({
    where: { id: existing.id },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
    include: { lineItems: true },
  });
  return toDto(updated);
}

async function declineByShareToken(token: string): Promise<QuoteDto | null> {
  const { prisma } = await import("@crawlix/db");
  const existing = await prisma.quote.findFirst({
    where: { shareToken: token },
    select: { id: true, status: true },
  });
  if (!existing || existing.status !== "SENT") return null;
  const updated = await prisma.quote.update({
    where: { id: existing.id },
    data: { status: "DECLINED", declinedAt: new Date() },
    include: { lineItems: true },
  });
  return toDto(updated);
}

export const quoteService = {
  create,
  update,
  list,
  get,
  send,
  remove,
  getByShareToken,
  acceptByShareToken,
  declineByShareToken,
};
