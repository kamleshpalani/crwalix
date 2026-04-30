// apps/web/src/server/services/anomalies.service.ts
//
// Phase 4.3 — anomaly detection.
//
// Surfaces signals that need human attention before they hurt revenue:
//   * Stale open deals (no activity in 14+ days)
//   * Pipeline drought (deals created this week vs trailing 4-week baseline)
//   * Reply rate collapse (last 7 days vs prior 28 days)
//   * Bounce rate spike (last 7 days >5%)
//   * Lead quality drop (avg lead score this week vs trailing baseline)
//   * Subscription churn risk (cancel scheduled or past_due)
//   * Dead leads (NEW/CONTACTED untouched 30+ days)
//
// Each detector is independent and only fires when its sample size is
// statistically meaningful. Returned anomalies have a severity tier
// (info / warning / critical), a human-readable description, and an
// optional actionable href so users can fix the issue in one click.

import { withOrg, prisma } from "@crawlix/db";

export type AnomalySeverity = "info" | "warning" | "critical";

export interface Anomaly {
  id: string;
  severity: AnomalySeverity;
  /** Short headline. */
  title: string;
  /** One-paragraph human explanation with concrete numbers. */
  description: string;
  /** Optional deep-link to fix or investigate. */
  href?: string;
  /** Structured evidence (counts, percentages) for UI rendering. */
  evidence?: Record<string, number | string>;
}

const DAY = 86_400_000;

function pct(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

export const anomaliesService = {
  async detect(orgId: string): Promise<Anomaly[]> {
    return withOrg(orgId, async (tx) => {
      const now = Date.now();
      const out: Anomaly[] = [];

      // ── 1) Stale open deals ─────────────────────────────────────────
      const staleCutoff = new Date(now - 14 * DAY);
      const staleDeals = await tx.deal.findMany({
        where: {
          status: "OPEN",
          updatedAt: { lt: staleCutoff },
        },
        select: { id: true, amountCents: true, updatedAt: true },
        take: 200,
      });
      if (staleDeals.length > 0) {
        const totalValue = staleDeals.reduce((s, d) => s + d.amountCents, 0);
        out.push({
          id: "stale-deals",
          severity: staleDeals.length >= 5 ? "warning" : "info",
          title: `${staleDeals.length} open deal${
            staleDeals.length === 1 ? "" : "s"
          } untouched for 14+ days`,
          description: `${fmtMoney(totalValue)} in total pipeline value has had no activity in over two weeks. Either follow up or close them out so the forecast reflects reality.`,
          href: "/pipeline",
          evidence: {
            count: staleDeals.length,
            totalValueCents: totalValue,
          },
        });
      }

      // ── 2) Pipeline drought (deals created this week vs baseline) ───
      const weekAgo = new Date(now - 7 * DAY);
      const fiveWeeksAgo = new Date(now - 35 * DAY);
      const [createdThisWeek, createdPrior4w] = await Promise.all([
        tx.deal.count({ where: { createdAt: { gte: weekAgo } } }),
        tx.deal.count({
          where: { createdAt: { gte: fiveWeeksAgo, lt: weekAgo } },
        }),
      ]);
      const baselineWeekly = createdPrior4w / 4;
      if (baselineWeekly >= 4 && createdThisWeek < baselineWeekly * 0.5) {
        out.push({
          id: "pipeline-drought",
          severity: "warning",
          title: "New deal volume dropped sharply",
          description: `${createdThisWeek} new deal${
            createdThisWeek === 1 ? "" : "s"
          } created in the last 7 days vs a trailing 4-week average of ${baselineWeekly.toFixed(
            1,
          )}/week. Top of funnel may be drying up.`,
          href: "/pipeline",
          evidence: {
            thisWeek: createdThisWeek,
            baselineWeekly: Number(baselineWeekly.toFixed(2)),
          },
        });
      }

      // ── 3) Reply rate collapse ──────────────────────────────────────
      const fourWeeksAgo = new Date(now - 28 * DAY);
      const baselineStart = new Date(now - 35 * DAY); // 28 days ending 7 days ago
      const baselineEnd = weekAgo;

      const [last7, baseline28] = await Promise.all([
        tx.outreachMessage.findMany({
          where: { sentAt: { gte: weekAgo } },
          select: { repliedAt: true, bouncedAt: true },
        }),
        tx.outreachMessage.findMany({
          where: { sentAt: { gte: baselineStart, lt: baselineEnd } },
          select: { repliedAt: true, bouncedAt: true },
        }),
      ]);

      const last7Count = last7.length;
      const last7Replies = last7.filter((m) => m.repliedAt).length;
      const last7Bounces = last7.filter((m) => m.bouncedAt).length;
      const baseCount = baseline28.length;
      const baseReplies = baseline28.filter((m) => m.repliedAt).length;

      if (last7Count >= 30 && baseCount >= 100) {
        const last7Rate = pct(last7Replies, last7Count);
        const baseRate = pct(baseReplies, baseCount);
        if (baseRate > 0 && last7Rate < baseRate * 0.5) {
          out.push({
            id: "reply-rate-collapse",
            severity: "critical",
            title: "Reply rate fell off a cliff",
            description: `Last 7 days: ${fmtPct(last7Rate)} reply rate over ${last7Count} sends, vs ${fmtPct(baseRate)} on the prior 28 days. Check your subject lines, sender reputation, and lead targeting.`,
            href: "/outreach",
            evidence: {
              last7Rate: Number((last7Rate * 100).toFixed(2)),
              baselineRate: Number((baseRate * 100).toFixed(2)),
              last7Sends: last7Count,
            },
          });
        }
      }

      // ── 4) Bounce rate spike ────────────────────────────────────────
      if (last7Count >= 30) {
        const bounceRate = pct(last7Bounces, last7Count);
        if (bounceRate >= 0.05) {
          out.push({
            id: "bounce-rate-spike",
            severity: bounceRate >= 0.1 ? "critical" : "warning",
            title: "Bounce rate is high",
            description: `${fmtPct(bounceRate)} of the last ${last7Count} sends bounced. Anything above 5% threatens deliverability — pause sends, verify your list, and warm up if needed.`,
            href: "/outreach",
            evidence: {
              bounceRate: Number((bounceRate * 100).toFixed(2)),
              bounces: last7Bounces,
              sends: last7Count,
            },
          });
        }
      }

      // ── 5) Lead quality drop ────────────────────────────────────────
      const [leadsThisWeek, leadsPrior4w] = await Promise.all([
        tx.lead.findMany({
          where: { createdAt: { gte: weekAgo }, score: { not: null } },
          select: { score: true },
        }),
        tx.lead.findMany({
          where: {
            createdAt: { gte: fiveWeeksAgo, lt: weekAgo },
            score: { not: null },
          },
          select: { score: true },
        }),
      ]);
      if (leadsThisWeek.length >= 20 && leadsPrior4w.length >= 80) {
        const avg = (rows: Array<{ score: number | null }>) =>
          rows.reduce((s, r) => s + (r.score ?? 0), 0) / rows.length;
        const thisAvg = avg(leadsThisWeek);
        const baseAvg = avg(leadsPrior4w);
        if (baseAvg > 0 && thisAvg < baseAvg * 0.8) {
          out.push({
            id: "lead-quality-drop",
            severity: "warning",
            title: "New lead quality dropped",
            description: `Average score of leads created this week is ${thisAvg.toFixed(
              0,
            )} vs ${baseAvg.toFixed(0)} on the trailing 4 weeks. Review your search filters or tighten qualification.`,
            href: "/leads",
            evidence: {
              thisWeekAvg: Number(thisAvg.toFixed(1)),
              baselineAvg: Number(baseAvg.toFixed(1)),
              thisWeekN: leadsThisWeek.length,
            },
          });
        }
      }

      // ── 6) Dead leads in early stages ───────────────────────────────
      const thirtyDaysAgo = new Date(now - 30 * DAY);
      const deadLeads = await tx.lead.count({
        where: {
          status: { in: ["NEW", "CONTACTED"] },
          updatedAt: { lt: thirtyDaysAgo },
        },
      });
      if (deadLeads >= 25) {
        out.push({
          id: "dead-leads",
          severity: "info",
          title: `${deadLeads} leads stalled in early stages`,
          description: `These leads are NEW or CONTACTED but haven't been touched in 30+ days. Either move them forward, archive, or feed them into a re-engagement sequence.`,
          href: "/leads",
          evidence: { count: deadLeads },
        });
      }

      return out;
    });
  },

  // Subscription churn check uses the global prisma client because Subscription
  // is not org-scoped via RLS in the same way — it's looked up by orgId directly.
  async detectChurnRisk(orgId: string): Promise<Anomaly | null> {
    const sub = await prisma.subscription.findUnique({
      where: { organizationId: orgId },
      select: {
        status: true,
        cancelAt: true,
        currentPeriodEnd: true,
        plan: true,
      },
    });
    if (!sub) return null;

    if (sub.cancelAt && sub.cancelAt.getTime() > Date.now()) {
      const days = Math.max(
        0,
        Math.round((sub.cancelAt.getTime() - Date.now()) / DAY),
      );
      return {
        id: "subscription-cancelling",
        severity: days <= 7 ? "critical" : "warning",
        title: "Subscription cancellation scheduled",
        description: `Your ${sub.plan} subscription is set to cancel in ${days} day${days === 1 ? "" : "s"} (${sub.cancelAt.toISOString().slice(0, 10)}). Reach out to retain or confirm offboarding.`,
        href: "/settings/billing",
        evidence: { daysUntilCancel: days, plan: sub.plan },
      };
    }
    if (
      sub.status === "past_due" ||
      sub.status === "unpaid" ||
      sub.status === "incomplete"
    ) {
      return {
        id: "subscription-past-due",
        severity: "critical",
        title: "Subscription payment failed",
        description: `Stripe reports the subscription is "${sub.status}". Update the payment method to avoid service interruption.`,
        href: "/settings/billing",
        evidence: { status: sub.status },
      };
    }
    return null;
  },

  async detectAll(orgId: string): Promise<Anomaly[]> {
    const [base, churn] = await Promise.all([
      this.detect(orgId),
      this.detectChurnRisk(orgId),
    ]);
    return churn ? [churn, ...base] : base;
  },
};
