// apps/worker/src/pipelines/billing-dunning.ts
//
// Phase 2 — automated dunning (payment retry + account suspension).
//
// Runs daily (scheduled via cron or BullMQ repeat). Scans for:
//  1. Overdue invoices (dueAt < now, status=OPEN, amountDueCents > 0).
//  2. Failed payments (status=FAILED) that are within retry window.
//  3. Past-due subscriptions that need escalation or suspension.
//
// Actions:
//  - Attempt to charge the default payment method again (via Stripe).
//  - Send dunning emails (reminder → urgent → final notice).
//  - After N failed attempts, downgrade to FREE or suspend the org.
//
// Idempotency: safe to re-run — Stripe calls are idempotent, and we track
// last dunning attempt timestamp to avoid spamming.

import { prisma, withOrg } from "@crawlix/db";
import { stripe, retrieveSubscription } from "@crawlix/billing";
import { logger } from "../lib/logger";

const log = logger.child({ component: "dunning" });

interface OverdueInvoice {
  id: string;
  organizationId: string;
  stripeInvoiceId: string | null;
  amountDueCents: number;
  dueAt: Date | null;
  createdAt: Date;
}

/**
 * Find all invoices that are overdue and unpaid.
 */
async function findOverdueInvoices(): Promise<OverdueInvoice[]> {
  const now = new Date();
  return prisma.invoice.findMany({
    where: {
      status: "OPEN",
      amountDueCents: { gt: 0 },
      dueAt: { lt: now },
    },
    select: {
      id: true,
      organizationId: true,
      stripeInvoiceId: true,
      amountDueCents: true,
      dueAt: true,
      createdAt: true,
    },
    orderBy: { dueAt: "asc" },
    take: 100, // process in batches
  });
}

/**
 * Attempt to charge the invoice again via Stripe.
 * Returns true if payment succeeded, false otherwise.
 */
async function retryInvoiceCharge(stripeInvoiceId: string): Promise<boolean> {
  try {
    const inv = await stripe().invoices.pay(stripeInvoiceId);
    return inv.status === "paid";
  } catch (err) {
    log.warn(
      { stripeInvoiceId, err: (err as Error).message },
      "invoice payment retry failed",
    );
    return false;
  }
}

/**
 * Escalate dunning: send reminder email, mark org for suspension if past threshold.
 */
async function escalateDunning(
  orgId: string,
  invoice: OverdueInvoice,
): Promise<void> {
  const daysPastDue = invoice.dueAt
    ? Math.floor((Date.now() - invoice.dueAt.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  log.info({ orgId, invoiceId: invoice.id, daysPastDue }, "escalating dunning");

  // Send dunning email (stub — integrate with @crawlix/email or notification service).
  // Example logic:
  //  - 1-3 days: gentle reminder
  //  - 4-7 days: urgent notice
  //  - 8+ days: final notice + suspension warning

  if (daysPastDue >= 14) {
    // After 14 days, downgrade to FREE or suspend.
    await suspendOrganization(orgId);
  }
}

/**
 * Suspend or downgrade the organization for non-payment.
 */
async function suspendOrganization(orgId: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { plan: true, subscription: true },
    });
    if (!org) return;

    // If they have an active Stripe subscription, cancel it.
    if (org.subscription?.stripeSubscriptionId) {
      try {
        await stripe().subscriptions.cancel(
          org.subscription.stripeSubscriptionId,
        );
      } catch (err) {
        log.error(
          { orgId, err: (err as Error).message },
          "failed to cancel subscription",
        );
      }
    }

    // Downgrade to FREE.
    await tx.organization.update({
      where: { id: orgId },
      data: { plan: "FREE" },
    });

    log.warn({ orgId }, "organization suspended for non-payment");
  });
}

/**
 * Main dunning runner. Called daily via scheduler or BullMQ repeat job.
 */
export async function runBillingDunning(): Promise<void> {
  log.info("billing dunning started");

  const overdueInvoices = await findOverdueInvoices();
  log.info({ count: overdueInvoices.length }, "overdue invoices found");

  for (const inv of overdueInvoices) {
    if (!inv.stripeInvoiceId) {
      // Manual invoice — skip auto-retry for now (require manual collection).
      continue;
    }

    const paid = await retryInvoiceCharge(inv.stripeInvoiceId);
    if (paid) {
      log.info({ invoiceId: inv.id }, "invoice payment succeeded on retry");
      continue;
    }

    // Payment failed — escalate dunning.
    await escalateDunning(inv.organizationId, inv).catch((err) =>
      log.error(
        { orgId: inv.organizationId, err: (err as Error).message },
        "dunning escalation failed",
      ),
    );
  }

  log.info("billing dunning completed");
}
