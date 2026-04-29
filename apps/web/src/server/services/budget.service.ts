/**
 * Budget enforcement service (Phase 2).
 *
 * Provides helpers for checking CostBudget limits before dispatching expensive
 * operations (AI calls, enrichments, email sends). Used by API routes and worker
 * pipelines to prevent runaway spend.
 */

import { prisma } from "@crawlix/db";

export interface BudgetCheck {
  allowed: boolean;
  reason?: string;
  /** Current usage this month. */
  used: number;
  /** Budget limit (from CostBudget). */
  limit: number;
}

/**
 * Ensure the org has a CostBudget row (create if missing).
 */
async function ensureCostBudget(orgId: string): Promise<void> {
  const existing = await prisma.costBudget.findUnique({
    where: { organizationId: orgId },
  });
  if (!existing) {
    await prisma.costBudget.create({
      data: {
        organizationId: orgId,
        hardLimitReached: false,
      },
    });
  }
}

/**
 * Check if the org can dispatch an AI operation based on their monthly AI token limit.
 * Returns { allowed: true } or { allowed: false, reason: "..." }.
 */
export async function checkAiBudget(
  orgId: string,
  estimatedTokens: number = 0,
): Promise<BudgetCheck> {
  await ensureCostBudget(orgId);

  const budget = await prisma.costBudget.findUnique({
    where: { organizationId: orgId },
    select: { aiMonthlyLimitCents: true, hardLimitReached: true },
  });

  if (!budget) {
    return { allowed: true, used: 0, limit: 0 };
  }

  if (budget.hardLimitReached) {
    return {
      allowed: false,
      reason:
        "Hard limit reached. Contact support to reset or upgrade your plan.",
      used: 0,
      limit: 0,
    };
  }

  if (!budget.aiMonthlyLimitCents) {
    // No limit set — allow.
    return { allowed: true, used: 0, limit: 0 };
  }

  // Check current month usage.
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const usage = await prisma.usageLog.aggregate({
    where: {
      organizationId: orgId,
      kind: { startsWith: "ai." },
      createdAt: { gte: startOfMonth },
    },
    _sum: { units: true },
  });

  const usedTokens = usage._sum.units ?? 0;
  const estimatedCost = estimatedTokens * 0.00001; // rough estimate: $0.01 per 1k tokens
  const limitCents = budget.aiMonthlyLimitCents;

  // Very rough check: if usedTokens * avg cost exceeds limit, block.
  // (For precise enforcement, track cumulative costUsd in metadata.)
  const usedCents = usedTokens * 0.001; // $0.001 per token = 0.1¢ per token
  if (usedCents >= limitCents) {
    return {
      allowed: false,
      reason: `Monthly AI budget exceeded (${(limitCents / 100).toFixed(2)} USD). Resets on the 1st.`,
      used: usedTokens,
      limit: limitCents,
    };
  }

  return { allowed: true, used: usedTokens, limit: limitCents };
}

/**
 * Check if the org can send an email based on their monthly email limit.
 */
export async function checkEmailBudget(orgId: string): Promise<BudgetCheck> {
  await ensureCostBudget(orgId);

  const budget = await prisma.costBudget.findUnique({
    where: { organizationId: orgId },
    select: { emailMonthlyLimit: true, hardLimitReached: true },
  });

  if (!budget) {
    return { allowed: true, used: 0, limit: 0 };
  }

  if (budget.hardLimitReached) {
    return {
      allowed: false,
      reason: "Hard limit reached. Contact support.",
      used: 0,
      limit: 0,
    };
  }

  if (!budget.emailMonthlyLimit) {
    return { allowed: true, used: 0, limit: 0 };
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const usage = await prisma.usageLog.aggregate({
    where: {
      organizationId: orgId,
      kind: "outreach.send",
      createdAt: { gte: startOfMonth },
    },
    _sum: { units: true },
  });

  const used = usage._sum.units ?? 0;
  const limit = budget.emailMonthlyLimit;

  if (used >= limit) {
    return {
      allowed: false,
      reason: `Monthly email limit exceeded (${limit}). Resets on the 1st.`,
      used,
      limit,
    };
  }

  return { allowed: true, used, limit };
}

/**
 * Check if the org can run an enrichment based on their monthly enrichment limit.
 */
export async function checkEnrichmentBudget(
  orgId: string,
): Promise<BudgetCheck> {
  await ensureCostBudget(orgId);

  const budget = await prisma.costBudget.findUnique({
    where: { organizationId: orgId },
    select: { enrichMonthlyLimit: true, hardLimitReached: true },
  });

  if (!budget) {
    return { allowed: true, used: 0, limit: 0 };
  }

  if (budget.hardLimitReached) {
    return {
      allowed: false,
      reason: "Hard limit reached. Contact support.",
      used: 0,
      limit: 0,
    };
  }

  if (!budget.enrichMonthlyLimit) {
    return { allowed: true, used: 0, limit: 0 };
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const usage = await prisma.usageLog.aggregate({
    where: {
      organizationId: orgId,
      kind: { startsWith: "enrich." },
      createdAt: { gte: startOfMonth },
    },
    _sum: { units: true },
  });

  const used = usage._sum.units ?? 0;
  const limit = budget.enrichMonthlyLimit;

  if (used >= limit) {
    return {
      allowed: false,
      reason: `Monthly enrichment limit exceeded (${limit}). Resets on the 1st.`,
      used,
      limit,
    };
  }

  return { allowed: true, used, limit };
}

/**
 * Hard-block the org from all billable operations (emergency brake).
 * Used by dunning pipeline when payment fails repeatedly.
 */
export async function setHardLimit(
  orgId: string,
  blocked: boolean,
): Promise<void> {
  await ensureCostBudget(orgId);
  await prisma.costBudget.update({
    where: { organizationId: orgId },
    data: { hardLimitReached: blocked },
  });
}
