/**
 * Budget enforcement utilities (shared between web and worker).
 *
 * Provides helpers for checking CostBudget limits before dispatching expensive
 * operations (AI calls, enrichments, email sends).
 */

import { prisma } from "./index";

export interface BudgetCheck {
  allowed: boolean;
  reason?: string;
  used: number;
  limit: number;
}

async function ensureCostBudget(orgId: string): Promise<void> {
  const existing = await prisma.costBudget.findUnique({
    where: { organizationId: orgId },
  });
  if (!existing) {
    await prisma.costBudget.create({
      data: { organizationId: orgId, hardLimitReached: false },
    });
  }
}

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
      reason: "Hard limit reached. Contact support.",
      used: 0,
      limit: 0,
    };
  }

  if (!budget.aiMonthlyLimitCents) {
    return { allowed: true, used: 0, limit: 0 };
  }

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
  const limitCents = budget.aiMonthlyLimitCents;
  const usedCents = usedTokens * 0.001;

  if (usedCents >= limitCents) {
    return {
      allowed: false,
      reason: `Monthly AI budget exceeded (${(limitCents / 100).toFixed(2)} USD).`,
      used: usedTokens,
      limit: limitCents,
    };
  }

  return { allowed: true, used: usedTokens, limit: limitCents };
}

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
      reason: `Monthly email limit exceeded (${limit}).`,
      used,
      limit,
    };
  }

  return { allowed: true, used, limit };
}

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
      reason: `Monthly enrichment limit exceeded (${limit}).`,
      used,
      limit,
    };
  }

  return { allowed: true, used, limit };
}

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
