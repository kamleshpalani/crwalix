// apps/web/src/server/services/reporting.service.ts
//
// Aggregations powering the /reports/* dashboards. Three reports:
//
//   leads   — funnel + sources + status mix in a date window
//   sales   — pipeline conversion + won/lost + revenue trend
//   billing — invoice + payment + subscription revenue (MRR proxy)
//
// All queries are tenant-scoped via `withOrg`. Numbers are integers in
// minor units; UI formats the money.

import { withOrg } from "@crawlix/db";

export type ReportRange = "7d" | "30d" | "90d" | "365d";

function rangeToDate(r: ReportRange): Date {
  const days = r === "7d" ? 7 : r === "30d" ? 30 : r === "90d" ? 90 : 365;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export interface LeadsReport {
  range: ReportRange;
  total: number;
  byStatus: Array<{ status: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  trend: Array<{ day: string; count: number }>;
}

export interface SalesReport {
  range: ReportRange;
  dealsCreated: number;
  dealsWon: number;
  dealsLost: number;
  winRatePct: number;
  revenueWonCents: number;
  pipelineOpenCents: number;
  byStage: Array<{
    stageId: string;
    stageName: string;
    count: number;
    valueCents: number;
  }>;
}

export interface BillingReport {
  range: ReportRange;
  invoiceCount: number;
  invoicedCents: number;
  collectedCents: number;
  outstandingCents: number;
  overdueCents: number;
  paymentsCount: number;
  mrrCents: number;
  activeSubscriptions: number;
  byPlan: Array<{ plan: string; count: number; mrrCents: number }>;
}

function bucketByDay<T extends { createdAt: Date }>(
  rows: T[],
): Array<{ day: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, count]) => ({ day, count }));
}

const PLAN_MONTHLY_CENTS: Record<string, number> = {
  FREE: 0,
  STARTER: 4900,
  GROWTH: 14900,
  SCALE: 39900,
};

export const reportingService = {
  async leads(orgId: string, range: ReportRange): Promise<LeadsReport> {
    const since = rangeToDate(range);
    return withOrg(orgId, async (tx) => {
      const rows = await tx.lead.findMany({
        where: { organizationId: orgId, createdAt: { gte: since } },
        select: { status: true, provider: true, createdAt: true },
      });
      const byStatusMap = new Map<string, number>();
      const bySourceMap = new Map<string, number>();
      for (const r of rows) {
        byStatusMap.set(r.status, (byStatusMap.get(r.status) ?? 0) + 1);
        const src = r.provider || "unknown";
        bySourceMap.set(src, (bySourceMap.get(src) ?? 0) + 1);
      }
      return {
        range,
        total: rows.length,
        byStatus: Array.from(byStatusMap.entries()).map(([status, count]) => ({
          status,
          count,
        })),
        bySource: Array.from(bySourceMap.entries())
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count),
        trend: bucketByDay(rows),
      };
    });
  },

  async sales(orgId: string, range: ReportRange): Promise<SalesReport> {
    const since = rangeToDate(range);
    return withOrg(orgId, async (tx) => {
      const created = await tx.deal.findMany({
        where: { organizationId: orgId, createdAt: { gte: since } },
        select: {
          id: true,
          status: true,
          amountCents: true,
          stageId: true,
          closedAt: true,
        },
      });
      const dealsCreated = created.length;
      const dealsWon = created.filter((d) => d.status === "WON").length;
      const dealsLost = created.filter((d) => d.status === "LOST").length;
      const closed = dealsWon + dealsLost;
      const winRatePct =
        closed === 0 ? 0 : Math.round((dealsWon / closed) * 100);
      const revenueWonCents = created
        .filter((d) => d.status === "WON")
        .reduce((s, d) => s + d.amountCents, 0);

      // Open pipeline value (across all time, current snapshot).
      const openDeals = await tx.deal.findMany({
        where: { organizationId: orgId, status: "OPEN" },
        select: { stageId: true, amountCents: true },
      });
      const pipelineOpenCents = openDeals.reduce(
        (s, d) => s + d.amountCents,
        0,
      );

      // Stage breakdown for current open pipeline.
      const stages = await tx.pipelineStage.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true },
      });
      const stageNameById = new Map(stages.map((s) => [s.id, s.name]));
      const byStageMap = new Map<
        string,
        { count: number; valueCents: number }
      >();
      for (const d of openDeals) {
        const cur = byStageMap.get(d.stageId) ?? { count: 0, valueCents: 0 };
        cur.count += 1;
        cur.valueCents += d.amountCents;
        byStageMap.set(d.stageId, cur);
      }
      return {
        range,
        dealsCreated,
        dealsWon,
        dealsLost,
        winRatePct,
        revenueWonCents,
        pipelineOpenCents,
        byStage: Array.from(byStageMap.entries()).map(([stageId, v]) => ({
          stageId,
          stageName: stageNameById.get(stageId) ?? stageId,
          count: v.count,
          valueCents: v.valueCents,
        })),
      };
    });
  },

  async billing(orgId: string, range: ReportRange): Promise<BillingReport> {
    const since = rangeToDate(range);
    const now = new Date();
    return withOrg(orgId, async (tx) => {
      const invoices = await tx.invoice.findMany({
        where: { organizationId: orgId, createdAt: { gte: since } },
        select: {
          status: true,
          totalCents: true,
          amountPaidCents: true,
          amountDueCents: true,
          dueAt: true,
        },
      });
      const invoiceCount = invoices.length;
      const invoicedCents = invoices.reduce((s, i) => s + i.totalCents, 0);
      const collectedCents = invoices.reduce(
        (s, i) => s + i.amountPaidCents,
        0,
      );
      const outstandingCents = invoices
        .filter((i) => i.status === "OPEN")
        .reduce((s, i) => s + i.amountDueCents, 0);
      const overdueCents = invoices
        .filter((i) => i.status === "OPEN" && i.dueAt && i.dueAt < now)
        .reduce((s, i) => s + i.amountDueCents, 0);

      const payments = await tx.payment.count({
        where: {
          organizationId: orgId,
          status: "SUCCEEDED",
          createdAt: { gte: since },
        },
      });

      // MRR snapshot: count active orgs in this tenant on each plan x price.
      // (We typically only have one Subscription row per org, but this is
      // future-proof against multi-product expansion.)
      const subs = await tx.subscription.findMany({
        where: { organizationId: orgId, status: "active" },
        select: { plan: true },
      });
      const planCounts = new Map<string, number>();
      for (const s of subs) {
        planCounts.set(s.plan, (planCounts.get(s.plan) ?? 0) + 1);
      }
      let mrrCents = 0;
      const byPlan = Array.from(planCounts.entries()).map(([plan, count]) => {
        const monthly = PLAN_MONTHLY_CENTS[plan] ?? 0;
        const planMrr = monthly * count;
        mrrCents += planMrr;
        return { plan, count, mrrCents: planMrr };
      });

      return {
        range,
        invoiceCount,
        invoicedCents,
        collectedCents,
        outstandingCents,
        overdueCents,
        paymentsCount: payments,
        mrrCents,
        activeSubscriptions: subs.length,
        byPlan,
      };
    });
  },
};
