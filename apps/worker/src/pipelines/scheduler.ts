/**
 * Polls the database for `Search` rows whose `nextRunAt` has elapsed and
 * enqueues a fresh `search.ingest` job for each. Updates `nextRunAt`
 * forward by the search's frequency so it fires again next cycle.
 *
 * Runs in-process inside the worker. Lightweight (one query/min) and safe
 * to run alongside Bull queues. RLS is bypassed via the unscoped Prisma
 * client because we're operating cross-tenant on the scheduler's behalf.
 */
import { Queue } from "bullmq";
import { prisma } from "@crawlix/db";
import {
  JobName,
  QueueName,
  LeadFocus,
  type ScheduleFrequency,
  type SearchIngestJob,
} from "@crawlix/shared";
import { getConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import { runInvoiceReminders } from "./invoice-reminder";
import { runSubscriptionRenewalNudges } from "./subscription-renewal-nudge";

const TICK_MS = Number(process.env.SCHEDULER_TICK_MS ?? 60_000);
/** Billing sweeps are heavy; run once per `BILLING_SWEEP_TICK_MS` (default 6 h). */
const BILLING_SWEEP_TICK_MS = Number(
  process.env.BILLING_SWEEP_TICK_MS ?? 6 * 60 * 60 * 1000,
);
const log = logger.child({ component: "scheduler" });

let _queue: Queue | null = null;
function searchQueue(): Queue {
  if (!_queue)
    _queue = new Queue(QueueName.SEARCH, { connection: getConnection() });
  return _queue;
}

function nextRunFor(
  freq: ScheduleFrequency,
  from: Date = new Date(),
): Date | null {
  const t = from.getTime();
  switch (freq) {
    case "DAILY":
      return new Date(t + 24 * 60 * 60 * 1000);
    case "WEEKLY":
      return new Date(t + 7 * 24 * 60 * 60 * 1000);
    case "MONTHLY":
      return new Date(t + 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

async function tick(): Promise<void> {
  const now = new Date();
  // Find searches whose nextRunAt is due.
  const due = await prisma.search.findMany({
    where: {
      scheduleFrequency: { in: ["DAILY", "WEEKLY", "MONTHLY"] },
      nextRunAt: { lte: now },
    },
    take: 25,
  });
  if (due.length === 0) return;
  log.info({ count: due.length }, "scheduler: dispatching due searches");

  for (const s of due) {
    try {
      const run = await prisma.searchRun.create({
        data: {
          organizationId: s.organizationId,
          searchId: s.id,
          provider: s.provider,
          status: "QUEUED",
          metadata: { trigger: "scheduler" },
        },
      });

      const job: SearchIngestJob = {
        organizationId: s.organizationId,
        searchRunId: run.id,
        provider: s.provider as SearchIngestJob["provider"],
        query: {
          keyword: s.keyword ?? undefined,
          niche: s.niche ?? undefined,
          city: s.city ?? undefined,
          state: s.state ?? undefined,
          country: s.country ?? undefined,
          postalCode: s.postalCode ?? undefined,
          radiusMeters: s.radiusMeters ?? undefined,
          limit: s.resultLimit,
        },
        options: {
          enrichOnInsert: false,
          scoreOnInsert: true,
          leadFocus: (s.leadFocus as LeadFocus) ?? LeadFocus.ALL,
          /** Marker the ingest pipeline reads to fire LEADS_DISCOVERED notifications. */
          notifyOnNewLeads: true,
        },
      };
      await searchQueue().add(JobName.SEARCH_INGEST, job);

      await prisma.search.update({
        where: { id: s.id },
        data: {
          lastRunAt: now,
          nextRunAt: nextRunFor(s.scheduleFrequency as ScheduleFrequency, now),
        },
      });
    } catch (err) {
      log.error(
        {
          err: err instanceof Error ? err.message : String(err),
          searchId: s.id,
        },
        "scheduler dispatch failed",
      );
    }
  }
}

export function startScheduler(): NodeJS.Timeout {
  log.info({ tickMs: TICK_MS }, "scheduler started");
  // Kick off immediately, then on every tick.
  void tick().catch((e) =>
    log.error({ err: e?.message }, "scheduler tick error"),
  );
  const t = setInterval(() => {
    void tick().catch((e) =>
      log.error({ err: e?.message }, "scheduler tick error"),
    );
  }, TICK_MS);
  t.unref();

  // Billing sweeps (invoice reminders + subscription renewal nudges) on a
  // separate, slower cadence. Fire once shortly after boot and then every
  // BILLING_SWEEP_TICK_MS.
  const runBillingSweeps = async () => {
    try {
      await runInvoiceReminders();
    } catch (e) {
      log.error(
        { err: e instanceof Error ? e.message : String(e) },
        "invoice reminder sweep failed",
      );
    }
    try {
      await runSubscriptionRenewalNudges();
    } catch (e) {
      log.error(
        { err: e instanceof Error ? e.message : String(e) },
        "renewal nudge sweep failed",
      );
    }
  };
  setTimeout(() => void runBillingSweeps(), 30_000).unref();
  setInterval(() => void runBillingSweeps(), BILLING_SWEEP_TICK_MS).unref();

  return t;
}
