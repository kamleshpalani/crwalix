// apps/worker/src/pipelines/invoice-reminder.ts
//
// Nightly sweep that finds in-app (non-Stripe) invoices that are overdue
// and emits a reminder notification + email. Stripe-managed invoices are
// handled by Stripe's own dunning + the billing-dunning.ts pipeline.
//
// Reminder cadence (per invoice):
//   - 3 days before dueAt   → "due soon"   (one-time)
//   - 1 day past dueAt      → "overdue"    (one-time)
//   - every 7 days after    → "still owing"
//
// We track the last reminder timestamp on Invoice.metadata.lastReminderAt
// so we never spam.

import { prisma } from "@crawlix/db";
import { notify } from "../lib/notify";
import { logger } from "../lib/logger";

const log = logger.child({ component: "invoice-reminder" });

const DAY = 24 * 60 * 60 * 1000;

interface ReminderRow {
  id: string;
  organizationId: string;
  number: string | null;
  amountDueCents: number;
  currency: string;
  dueAt: Date | null;
  customerEmail: string | null;
  metadata: unknown;
}

function readReminderMeta(meta: unknown): {
  lastReminderAt?: string;
  remindersSent?: number;
} {
  if (!meta || typeof meta !== "object") return {};
  const m = meta as Record<string, unknown>;
  return {
    lastReminderAt:
      typeof m.lastReminderAt === "string" ? m.lastReminderAt : undefined,
    remindersSent:
      typeof m.remindersSent === "number" ? m.remindersSent : undefined,
  };
}

function chooseReminderTier(
  dueAt: Date | null,
  lastSentAt: Date | null,
): {
  send: boolean;
  tier: "due_soon" | "overdue" | "still_owing" | null;
} {
  if (!dueAt) return { send: false, tier: null };
  const now = Date.now();
  const due = dueAt.getTime();
  const last = lastSentAt?.getTime() ?? 0;

  // 3 days before due
  if (due - now <= 3 * DAY && due - now > 0 && last === 0) {
    return { send: true, tier: "due_soon" };
  }
  // First overdue notice (1 day past)
  if (now - due >= 1 * DAY && now - due < 7 * DAY && last === 0) {
    return { send: true, tier: "overdue" };
  }
  // Recurring weekly nudge after 7 days past due
  if (now - due >= 7 * DAY && now - last >= 7 * DAY) {
    return { send: true, tier: "still_owing" };
  }
  return { send: false, tier: null };
}

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

async function findCandidates(): Promise<ReminderRow[]> {
  // OPEN invoices with no Stripe id (in-app self-hosted), unpaid, with a due date.
  return prisma.invoice.findMany({
    where: {
      status: "OPEN",
      stripeInvoiceId: null,
      amountDueCents: { gt: 0 },
      dueAt: { not: null },
    },
    select: {
      id: true,
      organizationId: true,
      number: true,
      amountDueCents: true,
      currency: true,
      dueAt: true,
      customerEmail: true,
      metadata: true,
    },
    take: 200,
  });
}

export async function runInvoiceReminders(): Promise<void> {
  log.info("invoice reminder sweep started");
  const rows = await findCandidates();
  let sent = 0;

  for (const inv of rows) {
    const meta = readReminderMeta(inv.metadata);
    const lastSent = meta.lastReminderAt ? new Date(meta.lastReminderAt) : null;
    const decision = chooseReminderTier(inv.dueAt, lastSent);
    if (!decision.send) continue;

    const moneyStr = formatMoney(inv.amountDueCents, inv.currency);
    const label = inv.number ?? inv.id.slice(0, 8);
    const isOverdue = decision.tier !== "due_soon";

    let title: string;
    let body: string;
    if (decision.tier === "due_soon") {
      title = `Invoice ${label} due soon`;
      body = `${moneyStr} is due on ${inv.dueAt?.toLocaleDateString() ?? "soon"}.`;
    } else if (decision.tier === "overdue") {
      title = `Invoice ${label} is overdue`;
      body = `${moneyStr} was due on ${inv.dueAt?.toLocaleDateString() ?? ""}.`;
    } else {
      title = `Invoice ${label} still owing`;
      body = `${moneyStr} remains unpaid \u2014 we'll keep nudging weekly until paid.`;
    }

    try {
      await notify({
        organizationId: inv.organizationId,
        kind: isOverdue ? "INVOICE_OVERDUE" : "INVOICE_DUE_SOON",
        title,
        body,
        href: "/invoices",
        data: {
          source: "invoice.reminder",
          invoiceId: inv.id,
          tier: decision.tier,
          amountDueCents: inv.amountDueCents,
          currency: inv.currency,
        },
      });

      // Stamp metadata so we don't re-send the same tier.
      const newMeta = {
        ...(typeof inv.metadata === "object" && inv.metadata
          ? (inv.metadata as Record<string, unknown>)
          : {}),
        lastReminderAt: new Date().toISOString(),
        remindersSent: (meta.remindersSent ?? 0) + 1,
        lastReminderTier: decision.tier,
      };
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { metadata: newMeta as never },
      });
      sent += 1;
    } catch (err) {
      log.warn(
        {
          invoiceId: inv.id,
          err: err instanceof Error ? err.message : String(err),
        },
        "reminder dispatch failed",
      );
    }
  }

  log.info(
    { candidates: rows.length, sent },
    "invoice reminder sweep finished",
  );
}
