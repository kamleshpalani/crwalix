// apps/worker/src/pipelines/weekly-digest.ts
//
// Phase 4.1 — AI-generated weekly business digest.
//
// For each org with at least one membership and an email recipient, this
// pipeline:
//   1. Aggregates the past 7 days of pipeline activity (leads, deals, won/lost,
//      revenue, conversion, median cycle, top sequence, blockers).
//   2. Asks the AI router to generate a friendly digest (subject/text/html).
//   3. Emails it to the org's notificationEmail (or first owner) and stores
//      a Notification row so it shows in the in-app feed.
//
// Idempotency: each run records `lastDigestAt` on Organization-scoped state
// via UsageLog metadata; we skip if a digest was already sent within 6 days.
// (We don't add a column for this until the cadence stabilizes.)
//
// Failure handling: per-org errors are logged and don't abort the batch.

import { prisma } from "@crawlix/db";
import { generateWeeklyDigest } from "@crawlix/ai";
import { sendEmail } from "@crawlix/email";
import { logger } from "../lib/logger";

const log = logger.child({ component: "weekly-digest" });

const PERIOD_DAYS = 7;
const MIN_GAP_MS = 6 * 24 * 60 * 60 * 1000; // re-run guard: 6 days

interface OrgRow {
  id: string;
  name: string;
  notificationEmail: string | null;
}

async function listOrgs(): Promise<OrgRow[]> {
  // Only orgs with at least one member — avoids spamming abandoned setups.
  return prisma.organization.findMany({
    where: { members: { some: {} } },
    select: { id: true, name: true, notificationEmail: true },
  });
}

async function ownerEmail(orgId: string): Promise<string | null> {
  const owner = await prisma.organizationMember.findFirst({
    where: { organizationId: orgId, role: "OWNER" },
    include: { user: { select: { email: true } } },
  });
  return owner?.user?.email ?? null;
}

async function alreadySentRecently(orgId: string): Promise<boolean> {
  const recent = await prisma.usageLog.findFirst({
    where: {
      organizationId: orgId,
      kind: "ai.report.weekly",
      createdAt: { gt: new Date(Date.now() - MIN_GAP_MS) },
    },
    select: { id: true },
  });
  return !!recent;
}

interface Stats {
  periodStart: Date;
  periodEnd: Date;
  newLeads: number;
  newDeals: number;
  dealsWon: number;
  dealsLost: number;
  revenueWonCents: number;
  openPipelineCents: number;
  conversionRate: number;
  medianCycleDays: number | null;
  blockers: string[];
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function computeStats(orgId: string): Promise<Stats> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - PERIOD_DAYS * 86_400_000);

  const [newLeads, newDeals, dealsWonRows, dealsLost, openDeals] =
    await Promise.all([
      prisma.lead.count({
        where: { organizationId: orgId, createdAt: { gte: periodStart } },
      }),
      prisma.deal.count({
        where: { organizationId: orgId, createdAt: { gte: periodStart } },
      }),
      prisma.deal.findMany({
        where: {
          organizationId: orgId,
          status: "WON",
          closedAt: { gte: periodStart },
        },
        select: { amountCents: true, createdAt: true, closedAt: true },
      }),
      prisma.deal.count({
        where: {
          organizationId: orgId,
          status: "LOST",
          closedAt: { gte: periodStart },
        },
      }),
      prisma.deal.aggregate({
        where: { organizationId: orgId, status: "OPEN" },
        _sum: { amountCents: true },
      }),
    ]);

  const dealsWon = dealsWonRows.length;
  const revenueWonCents = dealsWonRows.reduce(
    (sum, d) => sum + d.amountCents,
    0,
  );
  const cycleDays = dealsWonRows
    .filter((d) => d.closedAt)
    .map((d) =>
      Math.max(
        0,
        Math.round(
          (d.closedAt!.getTime() - d.createdAt.getTime()) / 86_400_000,
        ),
      ),
    );
  const medianCycleDays = median(cycleDays);
  const conversionRate =
    dealsWon + dealsLost === 0 ? 0 : dealsWon / (dealsWon + dealsLost);

  const blockers: string[] = [];

  // Heuristic: deals untouched in 14+ days are stale.
  const staleCount = await prisma.deal.count({
    where: {
      organizationId: orgId,
      status: "OPEN",
      updatedAt: { lt: new Date(Date.now() - 14 * 86_400_000) },
    },
  });
  if (staleCount > 0)
    blockers.push(`${staleCount} open deal(s) untouched for 14+ days`);

  // Heuristic: leads with no contact info make outreach impossible.
  const unreachable = await prisma.lead.count({
    where: {
      organizationId: orgId,
      createdAt: { gte: periodStart },
      AND: [{ email: null }, { phone: null }],
    },
  });
  if (unreachable > 0 && newLeads > 0) {
    const pct = Math.round((unreachable / newLeads) * 100);
    if (pct >= 30)
      blockers.push(
        `${pct}% of new leads are missing both email and phone — enrichment recommended`,
      );
  }

  return {
    periodStart,
    periodEnd,
    newLeads,
    newDeals,
    dealsWon,
    dealsLost,
    revenueWonCents,
    openPipelineCents: openDeals._sum.amountCents ?? 0,
    conversionRate,
    medianCycleDays,
    blockers,
  };
}

async function runForOrg(org: OrgRow): Promise<void> {
  if (await alreadySentRecently(org.id)) {
    log.info({ orgId: org.id }, "skip: digest already sent within window");
    return;
  }

  const recipient = org.notificationEmail ?? (await ownerEmail(org.id));
  if (!recipient) {
    log.warn({ orgId: org.id }, "no digest recipient — skip");
    return;
  }

  const stats = await computeStats(org.id);

  // Skip orgs with literally zero activity — the digest would be empty.
  if (
    stats.newLeads === 0 &&
    stats.newDeals === 0 &&
    stats.dealsWon === 0 &&
    stats.dealsLost === 0 &&
    stats.openPipelineCents === 0
  ) {
    log.info({ orgId: org.id }, "skip: no activity this period");
    return;
  }

  const digest = await generateWeeklyDigest({
    organizationId: org.id,
    orgName: org.name,
    stats: {
      periodStart: stats.periodStart.toISOString().slice(0, 10),
      periodEnd: stats.periodEnd.toISOString().slice(0, 10),
      newLeads: stats.newLeads,
      newDeals: stats.newDeals,
      dealsWon: stats.dealsWon,
      dealsLost: stats.dealsLost,
      revenueWonCents: stats.revenueWonCents,
      openPipelineCents: stats.openPipelineCents,
      conversionRate: stats.conversionRate,
      medianCycleDays: stats.medianCycleDays,
      blockers: stats.blockers,
      topSequence: null,
    },
  });

  await sendEmail({
    to: recipient,
    subject: digest.subject || "Your weekly business digest",
    text: digest.text,
    html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0f172a;background:#f8fafc;padding:24px;">${digest.html}</body></html>`,
  });

  // Drop a Notification row so it shows in the in-app feed too.
  await prisma.notification
    .create({
      data: {
        organizationId: org.id,
        kind: "WEEKLY_DIGEST",
        title: digest.subject || "Weekly digest",
        body: digest.text.slice(0, 500),
        data: {
          periodStart: stats.periodStart.toISOString(),
          periodEnd: stats.periodEnd.toISOString(),
          provider: digest.provider,
          model: digest.model,
        },
      },
    })
    .catch((err) => {
      // Non-fatal — digest already emailed.
      log.warn(
        { orgId: org.id, err: String(err) },
        "notification insert failed",
      );
    });

  log.info(
    {
      orgId: org.id,
      recipient,
      provider: digest.provider,
      model: digest.model,
      tokens: digest.usage.totalTokens,
    },
    "digest sent",
  );
}

export async function runWeeklyDigest(): Promise<void> {
  const orgs = await listOrgs();
  log.info({ orgs: orgs.length }, "weekly digest batch start");
  for (const org of orgs) {
    try {
      await runForOrg(org);
    } catch (err) {
      log.error(
        {
          orgId: org.id,
          err: err instanceof Error ? err.message : String(err),
        },
        "digest failed for org",
      );
    }
  }
  log.info("weekly digest batch done");
}
