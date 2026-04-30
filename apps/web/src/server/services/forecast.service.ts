// apps/web/src/server/services/forecast.service.ts
//
// Phase 4.2 — Monte-Carlo pipeline forecasting.
//
// Given the org's open deals, we estimate a probability-of-close for each
// one and run N simulations to produce a P10/P50/P90 revenue forecast for
// a horizon (default 90 days).
//
// Per-deal close probability is the blend of:
//   1. The configured stage probability (PipelineStage.probability / 100).
//   2. The org's historical win-rate from that stage (#won / (#won+#lost))
//      over the last 180 days, smoothed with a small prior so brand-new
//      orgs don't get NaN.
// Blend weight tilts toward history once we have ≥10 closed deals from a
// stage, otherwise toward the configured stage probability.
//
// Per-deal expected close date:
//   - If `expectedCloseAt` is set and within the horizon → use it.
//   - Otherwise → assume uniform distribution across the horizon.
// Deals whose expected close is past the horizon are skipped (out of scope).

import { withOrg } from "@crawlix/db";

const SIMS = 4000;
const HISTORY_WINDOW_DAYS = 180;
const HISTORY_PRIOR = 5; // pseudo-count; soft pull toward 50%

export interface ForecastInput {
  /** Forecast horizon in days. */
  horizonDays?: number;
  /** Optional pipeline filter; default: all pipelines for the org. */
  pipelineId?: string;
}

export interface ForecastBucket {
  /** Inclusive start date (ISO yyyy-mm-dd). */
  start: string;
  /** Exclusive end date (ISO yyyy-mm-dd). */
  end: string;
  p10Cents: number;
  p50Cents: number;
  p90Cents: number;
  meanCents: number;
}

export interface ForecastResult {
  horizonDays: number;
  pipelineId: string | null;
  generatedAt: string;
  totals: {
    openDeals: number;
    weightedPipelineCents: number;
    p10Cents: number;
    p50Cents: number;
    p90Cents: number;
    meanCents: number;
  };
  buckets: ForecastBucket[]; // 30-day buckets across the horizon
  topDeals: Array<{
    id: string;
    title: string;
    amountCents: number;
    probability: number;
    expectedCloseAt: string | null;
    contributionCents: number; // amount * probability
  }>;
  /** Per-stage diagnostics for transparency. */
  stages: Array<{
    stageId: string;
    stageName: string;
    configuredProbability: number; // 0..1
    historicalWinRate: number | null; // 0..1, null if no data
    closedSampleSize: number;
    blendedProbability: number; // 0..1
    openDeals: number;
    openValueCents: number;
  }>;
}

function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo]!;
  const frac = pos - lo;
  return Math.round(sortedAsc[lo]! * (1 - frac) + sortedAsc[hi]! * frac);
}

export const forecastService = {
  async run(orgId: string, input: ForecastInput = {}): Promise<ForecastResult> {
    const horizonDays = Math.max(7, Math.min(365, input.horizonDays ?? 90));
    const now = Date.now();
    const horizonEnd = now + horizonDays * 86_400_000;
    const historyStart = new Date(now - HISTORY_WINDOW_DAYS * 86_400_000);

    return withOrg(orgId, async (tx) => {
      // Stages, scoped to org / optional pipeline.
      const stages = await tx.pipelineStage.findMany({
        where: input.pipelineId ? { pipelineId: input.pipelineId } : {},
        select: {
          id: true,
          name: true,
          pipelineId: true,
          probability: true,
          isWon: true,
          isLost: true,
        },
      });
      const stageById = new Map(stages.map((s) => [s.id, s]));

      // Open deals to forecast.
      const openDeals = await tx.deal.findMany({
        where: {
          status: "OPEN",
          ...(input.pipelineId ? { pipelineId: input.pipelineId } : {}),
        },
        select: {
          id: true,
          title: true,
          amountCents: true,
          stageId: true,
          expectedCloseAt: true,
        },
      });

      // Historical wins/losses by stage over the last 180 days for empirical
      // calibration. We aggregate in JS to keep it simple.
      const closed = await tx.deal.findMany({
        where: {
          status: { in: ["WON", "LOST"] },
          closedAt: { gte: historyStart },
          ...(input.pipelineId ? { pipelineId: input.pipelineId } : {}),
        },
        select: { stageId: true, status: true },
      });

      const winLossByStage = new Map<
        string,
        { wins: number; losses: number }
      >();
      for (const d of closed) {
        const row =
          winLossByStage.get(d.stageId) ??
          ({ wins: 0, losses: 0 } as { wins: number; losses: number });
        if (d.status === "WON") row.wins += 1;
        else row.losses += 1;
        winLossByStage.set(d.stageId, row);
      }

      // Per-stage blended probability.
      const stageProb = new Map<string, number>();
      const stageDiag: ForecastResult["stages"] = [];
      for (const s of stages) {
        const configured = Math.min(1, Math.max(0, s.probability / 100));
        const wl = winLossByStage.get(s.id);
        const sample = wl ? wl.wins + wl.losses : 0;
        const historical =
          sample > 0
            ? (wl!.wins + HISTORY_PRIOR * configured) / (sample + HISTORY_PRIOR)
            : null;
        // Blend: at sample=0 → fully configured; at sample≥10 → 70% history.
        const w = Math.min(1, sample / 10) * 0.7;
        const blended =
          historical === null
            ? configured
            : (1 - w) * configured + w * historical;
        // Terminal stages: fixed.
        const final = s.isWon ? 1 : s.isLost ? 0 : blended;
        stageProb.set(s.id, final);

        stageDiag.push({
          stageId: s.id,
          stageName: s.name,
          configuredProbability: configured,
          historicalWinRate: historical,
          closedSampleSize: sample,
          blendedProbability: final,
          openDeals: 0,
          openValueCents: 0,
        });
      }
      const stageDiagById = new Map(stageDiag.map((s) => [s.stageId, s]));

      // Project each open deal into the horizon.
      interface Projected {
        id: string;
        title: string;
        amountCents: number;
        probability: number;
        // ms timestamp the deal is expected to close at (uniform if unknown)
        sampleClose: () => number;
        expectedCloseAt: string | null;
      }
      const projected: Projected[] = [];

      for (const d of openDeals) {
        const stage = stageById.get(d.stageId);
        if (!stage || stage.isLost) continue; // shouldn't happen for OPEN
        const p = stageProb.get(d.stageId) ?? 0;
        if (p <= 0) continue;

        const diag = stageDiagById.get(d.stageId);
        if (diag) {
          diag.openDeals += 1;
          diag.openValueCents += d.amountCents;
        }

        let sampleClose: () => number;
        if (d.expectedCloseAt) {
          const t = d.expectedCloseAt.getTime();
          if (t > horizonEnd) continue; // outside horizon
          if (t < now) {
            // Overdue — treat as "could close any day in next 30".
            sampleClose = () => now + Math.random() * 30 * 86_400_000;
          } else {
            // Tight Gaussian-ish jitter around the expected date (±7 days),
            // clamped to [now, horizonEnd].
            sampleClose = () => {
              const jitter =
                (Math.random() + Math.random() - 1) * 7 * 86_400_000;
              return Math.max(now, Math.min(horizonEnd, t + jitter));
            };
          }
        } else {
          sampleClose = () => now + Math.random() * (horizonEnd - now);
        }

        projected.push({
          id: d.id,
          title: d.title,
          amountCents: d.amountCents,
          probability: p,
          sampleClose,
          expectedCloseAt: d.expectedCloseAt
            ? d.expectedCloseAt.toISOString()
            : null,
        });
      }

      // Define 30-day buckets.
      const bucketSizeDays = 30;
      const numBuckets = Math.ceil(horizonDays / bucketSizeDays);
      const bucketStartTs: number[] = [];
      const bucketEndTs: number[] = [];
      for (let i = 0; i < numBuckets; i++) {
        const start = now + i * bucketSizeDays * 86_400_000;
        const end =
          i === numBuckets - 1
            ? horizonEnd
            : now + (i + 1) * bucketSizeDays * 86_400_000;
        bucketStartTs.push(start);
        bucketEndTs.push(end);
      }

      // Run simulations.
      const totals: number[] = new Array(SIMS);
      const bucketTotals: number[][] = Array.from({ length: numBuckets }, () =>
        new Array(SIMS).fill(0),
      );

      for (let s = 0; s < SIMS; s++) {
        let simTotal = 0;
        for (const d of projected) {
          if (Math.random() >= d.probability) continue;
          simTotal += d.amountCents;
          const closeTs = d.sampleClose();
          // Find bucket.
          for (let b = 0; b < numBuckets; b++) {
            if (closeTs >= bucketStartTs[b]! && closeTs < bucketEndTs[b]!) {
              bucketTotals[b]![s] += d.amountCents;
              break;
            }
          }
        }
        totals[s] = simTotal;
      }
      totals.sort((a, b) => a - b);

      const buckets: ForecastBucket[] = bucketTotals.map((arr, i) => {
        arr.sort((a, b) => a - b);
        const mean =
          arr.length === 0
            ? 0
            : Math.round(arr.reduce((x, y) => x + y, 0) / arr.length);
        return {
          start: new Date(bucketStartTs[i]!).toISOString().slice(0, 10),
          end: new Date(bucketEndTs[i]!).toISOString().slice(0, 10),
          p10Cents: quantile(arr, 0.1),
          p50Cents: quantile(arr, 0.5),
          p90Cents: quantile(arr, 0.9),
          meanCents: mean,
        };
      });

      const totalMean =
        totals.length === 0
          ? 0
          : Math.round(totals.reduce((x, y) => x + y, 0) / totals.length);

      const weightedPipelineCents = projected.reduce(
        (sum, d) => sum + Math.round(d.amountCents * d.probability),
        0,
      );

      const topDeals = [...projected]
        .map((d) => ({
          id: d.id,
          title: d.title,
          amountCents: d.amountCents,
          probability: d.probability,
          expectedCloseAt: d.expectedCloseAt,
          contributionCents: Math.round(d.amountCents * d.probability),
        }))
        .sort((a, b) => b.contributionCents - a.contributionCents)
        .slice(0, 10);

      return {
        horizonDays,
        pipelineId: input.pipelineId ?? null,
        generatedAt: new Date().toISOString(),
        totals: {
          openDeals: projected.length,
          weightedPipelineCents,
          p10Cents: quantile(totals, 0.1),
          p50Cents: quantile(totals, 0.5),
          p90Cents: quantile(totals, 0.9),
          meanCents: totalMean,
        },
        buckets,
        topDeals,
        stages: stageDiag.filter(
          (s) => s.openDeals > 0 || s.closedSampleSize > 0,
        ),
      };
    });
  },
};
