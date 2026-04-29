/**
 * Subscription & entitlement service (Phase 2).
 *
 * Provides helpers for checking org subscription status and plan-based
 * entitlements. Used by API routes and server components to gate premium
 * features.
 */

import { prisma, withOrg } from "@crawlix/db";

export type Plan = "FREE" | "STARTER" | "GROWTH" | "SCALE";

export interface SubscriptionStatus {
  plan: Plan;
  /** Whether the subscription is currently active (paid, trialing, or in grace period). */
  isActive: boolean;
  /** Stripe subscription status (if any). */
  stripeStatus?: string;
  /** When the current period ends (subscription billing cycle). */
  currentPeriodEnd?: Date;
  /** If set, the subscription is scheduled to cancel at this date. */
  cancelAt?: Date;
}

export async function getSubscriptionStatus(
  orgId: string,
): Promise<SubscriptionStatus> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { plan: true, subscription: true },
  });

  if (!org) {
    return { plan: "FREE", isActive: false };
  }

  const sub = org.subscription;
  if (!sub) {
    return { plan: org.plan as Plan, isActive: org.plan === "FREE" };
  }

  // Stripe subscription statuses that count as "active":
  // - active: currently paid and active
  // - trialing: in trial period
  // - past_due: payment failed but still in grace period
  const activeStatuses = ["active", "trialing", "past_due"];
  const isActive = activeStatuses.includes(sub.status);

  return {
    plan: sub.plan as Plan,
    isActive,
    stripeStatus: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd ?? undefined,
    cancelAt: sub.cancelAt ?? undefined,
  };
}

/**
 * Plan-based entitlements. Add more fields as features are scoped to plans.
 */
export interface Entitlements {
  /** Max leads the org can store. */
  maxLeads: number;
  /** Max searches per month. */
  maxSearchesPerMonth: number;
  /** Max AI tokens per month (in thousands). */
  maxAiTokensPerMonth: number;
  /** Max outbound emails per month. */
  maxEmailsPerMonth: number;
  /** Can access AI proposal generator. */
  canUseAiProposals: boolean;
  /** Can use outreach sequences. */
  canUseSequences: boolean;
  /** Can access advanced CRM features. */
  canUseAdvancedCrm: boolean;
}

const PLAN_LIMITS: Record<Plan, Entitlements> = {
  FREE: {
    maxLeads: 100,
    maxSearchesPerMonth: 5,
    maxAiTokensPerMonth: 10, // 10k tokens
    maxEmailsPerMonth: 50,
    canUseAiProposals: false,
    canUseSequences: false,
    canUseAdvancedCrm: false,
  },
  STARTER: {
    maxLeads: 1000,
    maxSearchesPerMonth: 50,
    maxAiTokensPerMonth: 100, // 100k tokens
    maxEmailsPerMonth: 500,
    canUseAiProposals: true,
    canUseSequences: true,
    canUseAdvancedCrm: false,
  },
  GROWTH: {
    maxLeads: 10000,
    maxSearchesPerMonth: 200,
    maxAiTokensPerMonth: 500, // 500k tokens
    maxEmailsPerMonth: 5000,
    canUseAiProposals: true,
    canUseSequences: true,
    canUseAdvancedCrm: true,
  },
  SCALE: {
    maxLeads: 100000,
    maxSearchesPerMonth: 1000,
    maxAiTokensPerMonth: 2000, // 2M tokens
    maxEmailsPerMonth: 50000,
    canUseAiProposals: true,
    canUseSequences: true,
    canUseAdvancedCrm: true,
  },
};

export async function getEntitlements(orgId: string): Promise<Entitlements> {
  const status = await getSubscriptionStatus(orgId);
  return PLAN_LIMITS[status.plan];
}

/**
 * Check if the org can perform an action based on their plan + current usage.
 * Returns { allowed: true } or { allowed: false, reason: "..." }.
 */
export interface UsageCheckResult {
  allowed: boolean;
  reason?: string;
}

export async function checkUsageLimit(
  orgId: string,
  kind: "leads" | "searches" | "ai_tokens" | "emails",
): Promise<UsageCheckResult> {
  const entitlements = await getEntitlements(orgId);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let limit: number;
  let usageKind: string;

  if (kind === "leads") {
    limit = entitlements.maxLeads;
    const count = await withOrg(orgId, (tx) =>
      tx.lead.count({ where: { organizationId: orgId } }),
    );
    if (count >= limit) {
      return {
        allowed: false,
        reason: `Lead limit reached (${limit}). Upgrade your plan to add more.`,
      };
    }
    return { allowed: true };
  }

  if (kind === "searches") {
    limit = entitlements.maxSearchesPerMonth;
    usageKind = "search.ingest";
  } else if (kind === "ai_tokens") {
    limit = entitlements.maxAiTokensPerMonth * 1000; // convert to actual tokens
    usageKind = "ai.%"; // wildcard for all AI usage kinds
  } else if (kind === "emails") {
    limit = entitlements.maxEmailsPerMonth;
    usageKind = "outreach.send";
  } else {
    return { allowed: true };
  }

  const usage = await prisma.usageLog.aggregate({
    where: {
      organizationId: orgId,
      kind: { startsWith: usageKind.replace("%", "") },
      createdAt: { gte: startOfMonth },
    },
    _sum: { units: true },
  });

  const used = usage._sum.units ?? 0;
  if (used >= limit) {
    return {
      allowed: false,
      reason: `Monthly ${kind} limit reached (${limit}). Resets on the 1st or upgrade your plan.`,
    };
  }

  return { allowed: true };
}

/**
 * Middleware-style guard for server actions or API routes.
 * Throws an error if the org's subscription is not active or they've exceeded limits.
 */
export async function requireActiveSubscription(orgId: string): Promise<void> {
  const status = await getSubscriptionStatus(orgId);
  if (!status.isActive) {
    throw new Error(
      "Subscription inactive. Please update your billing details.",
    );
  }
}
