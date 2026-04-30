// apps/worker/src/pipelines/subscription-renewal-nudge.ts
//
// Nightly sweep that finds active subscriptions whose currentPeriodEnd is
// within the next 7 days and emits a heads-up notification.
//
// We track the last-nudged timestamp on Subscription.metadata.lastRenewalNudgeAt
// so each renewal cycle only fires one nudge.

import { prisma } from "@crawlix/db";
import { notify } from "../lib/notify";
import { logger } from "../lib/logger";

const log = logger.child({ component: "renewal-nudge" });

const DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 7;

interface NudgeRow {
  id: string;
  organizationId: string;
  plan: string;
  currentPeriodEnd: Date | null;
  cancelAt: Date | null;
  metadata: unknown;
}

function readMeta(meta: unknown): { lastRenewalNudgeAt?: string } {
  if (!meta || typeof meta !== "object") return {};
  const m = meta as Record<string, unknown>;
  return {
    lastRenewalNudgeAt:
      typeof m.lastRenewalNudgeAt === "string"
        ? m.lastRenewalNudgeAt
        : undefined,
  };
}

function shouldNudge(
  periodEnd: Date | null,
  cancelAt: Date | null,
  lastNudge: Date | null,
): boolean {
  if (!periodEnd) return false;
  const now = Date.now();
  const end = periodEnd.getTime();
  if (end - now > WINDOW_DAYS * DAY) return false;
  if (end - now < 0) return false; // already past — Stripe webhook handles renewal/cancel
  // Skip if user already cancelled (they don't need a renewal nudge).
  if (cancelAt && cancelAt.getTime() <= end) return false;
  // Skip if we already nudged within the last 14 days (covers the period).
  if (lastNudge && now - lastNudge.getTime() < 14 * DAY) return false;
  return true;
}

export async function runSubscriptionRenewalNudges(): Promise<void> {
  log.info("subscription renewal nudge sweep started");
  const upcoming = new Date(Date.now() + WINDOW_DAYS * DAY);
  const rows: NudgeRow[] = await prisma.subscription.findMany({
    where: {
      status: "active",
      currentPeriodEnd: { not: null, lte: upcoming },
    },
    select: {
      id: true,
      organizationId: true,
      plan: true,
      currentPeriodEnd: true,
      cancelAt: true,
      metadata: true,
    },
    take: 200,
  });

  let sent = 0;
  for (const sub of rows) {
    const meta = readMeta(sub.metadata);
    const lastNudge = meta.lastRenewalNudgeAt
      ? new Date(meta.lastRenewalNudgeAt)
      : null;
    if (!shouldNudge(sub.currentPeriodEnd, sub.cancelAt, lastNudge)) continue;

    const dateStr =
      sub.currentPeriodEnd?.toLocaleDateString() ?? "the upcoming period";
    try {
      await notify({
        organizationId: sub.organizationId,
        kind: "SUBSCRIPTION_RENEWAL_DUE",
        title: `${sub.plan} subscription renews on ${dateStr}`,
        body: "We'll attempt to charge your saved payment method automatically. Update billing details if anything has changed.",
        href: "/settings/billing",
        data: {
          source: "subscription.renewal_nudge",
          subscriptionId: sub.id,
          plan: sub.plan,
          renewsAt: sub.currentPeriodEnd?.toISOString() ?? null,
        },
      });

      const newMeta = {
        ...(typeof sub.metadata === "object" && sub.metadata
          ? (sub.metadata as Record<string, unknown>)
          : {}),
        lastRenewalNudgeAt: new Date().toISOString(),
      };
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { metadata: newMeta as never },
      });
      sent += 1;
    } catch (err) {
      log.warn(
        {
          subscriptionId: sub.id,
          err: err instanceof Error ? err.message : String(err),
        },
        "renewal nudge failed",
      );
    }
  }

  log.info({ candidates: rows.length, sent }, "renewal nudge sweep finished");
}
