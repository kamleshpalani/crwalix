import { config as loadEnv } from "dotenv";
import path from "node:path";
import url from "node:url";

// Load .env.local from the worker workspace, then fall back to repo root.
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../.env.local") });
loadEnv({ path: path.resolve(__dirname, "../../../.env.local") });

import { Worker, type Job } from "bullmq";
import {
  JobName,
  QueueName,
  type DsarProcessJob,
  type EnrichmentJob,
  type GenerateProposalJob,
  type IntelBuildJob,
  type OutreachClassifyReplyJob,
  type OutreachSendJob,
  type OutreachSequenceTickJob,
  type ScoreLeadJob,
  type SearchIngestJob,
  type VibeProspectJob,
  type VibeProspectBulkJob,
} from "@crawlix/shared";
import { getConnection } from "./lib/redis";
import { logger } from "./lib/logger";
import { runSearchIngest } from "./pipelines/search-ingest";
import { runScoreLead } from "./pipelines/score-lead";
import { runWebsiteEnrichment } from "./pipelines/enrich-website";
import { runStubEnrichment } from "./pipelines/enrich-stub";
import { runBusinessDescriptionEnrichment } from "./pipelines/enrich-business-description";
import { runReviewSummaryEnrichment } from "./pipelines/enrich-review-summary";
import { runWebsiteReportEnrichment } from "./pipelines/enrich-website-report";
import { runIntelBuild } from "./pipelines/intel-build";
import { runComplianceCleanup } from "./pipelines/compliance-cleanup";
import { runGenerateProposal } from "./pipelines/generate-proposal";
import { runOutreachSend } from "./pipelines/outreach-send";
import { runOutreachSequenceTick } from "./pipelines/outreach-sequence-tick";
import { runOutreachClassifyReply } from "./pipelines/outreach-classify-reply";
import { runBillingDunning } from "./pipelines/billing-dunning";
import { runDsarProcess } from "./pipelines/dsar-process";
import { runWeeklyDigest } from "./pipelines/weekly-digest";
import {
  runVibeProspect,
  runVibeProspectBulk,
} from "./pipelines/vibe-prospect";
import { startScheduler } from "./pipelines/scheduler";

const connection = getConnection();

function makeWorker<T>(
  queue: string,
  handler: (name: string, data: T) => Promise<void>,
  concurrency: number,
): Worker {
  const w = new Worker<T>(
    queue,
    async (job: Job<T>) => {
      logger.info({ queue, name: job.name, id: job.id }, "job start");
      await handler(job.name, job.data);
      logger.info({ queue, name: job.name, id: job.id }, "job done");
    },
    { connection, concurrency },
  );
  w.on("failed", (job, err) =>
    logger.error({ queue, jobId: job?.id, err: err.message }, "job failed"),
  );
  return w;
}

const searchWorker = makeWorker<SearchIngestJob>(
  QueueName.SEARCH,
  async (name, data) => {
    if (name === JobName.SEARCH_INGEST) return runSearchIngest(data);
    logger.warn({ name }, "unknown search job");
  },
  4,
);

const scoringWorker = makeWorker<ScoreLeadJob>(
  QueueName.SCORING,
  async (name, data) => {
    if (name === JobName.SCORE_LEAD) return runScoreLead(data);
    logger.warn({ name }, "unknown scoring job");
  },
  8,
);

const enrichmentWorker = makeWorker<EnrichmentJob | IntelBuildJob>(
  QueueName.ENRICHMENT,
  async (name, data) => {
    if (name === JobName.ENRICH_WEBSITE)
      return runWebsiteEnrichment(data as EnrichmentJob);
    if (
      name === JobName.ENRICH_EMAIL ||
      name === JobName.ENRICH_EMAIL_VERIFY ||
      name === JobName.ENRICH_SOCIAL ||
      name === JobName.ENRICH_COMPANY ||
      name === JobName.ENRICH_CONTACT
    )
      return runStubEnrichment(data as EnrichmentJob);
    if (name === JobName.ENRICH_BUSINESS_DESCRIPTION)
      return runBusinessDescriptionEnrichment(data as EnrichmentJob);
    if (name === JobName.ENRICH_REVIEW_SUMMARY)
      return runReviewSummaryEnrichment(data as EnrichmentJob);
    if (name === JobName.ENRICH_WEBSITE_REPORT)
      return runWebsiteReportEnrichment(data as EnrichmentJob);
    if (name === JobName.INTEL_BUILD)
      return runIntelBuild(data as IntelBuildJob);
    logger.warn({ name }, "unknown enrichment job");
  },
  4,
);

const crmWorker = makeWorker<GenerateProposalJob>(
  QueueName.CRM,
  async (name, data) => {
    if (name === JobName.CRM_GENERATE_PROPOSAL)
      return runGenerateProposal(data);
    logger.warn({ name }, "unknown crm job");
  },
  2,
);

const outreachWorker = makeWorker<
  OutreachSendJob | OutreachSequenceTickJob | OutreachClassifyReplyJob
>(
  QueueName.OUTREACH,
  async (name, data) => {
    if (name === JobName.OUTREACH_SEND)
      return runOutreachSend(data as OutreachSendJob);
    if (name === JobName.OUTREACH_SEQUENCE_TICK)
      return runOutreachSequenceTick(data as OutreachSequenceTickJob);
    if (name === JobName.OUTREACH_CLASSIFY_REPLY)
      return runOutreachClassifyReply(data as OutreachClassifyReplyJob);
    logger.warn({ name }, "unknown outreach job");
  },
  4,
);

const systemWorker = makeWorker<DsarProcessJob>(
  QueueName.SYSTEM,
  async (name, data) => {
    if (name === JobName.DSAR_PROCESS) return runDsarProcess(data);
    logger.warn({ name }, "unknown system job");
  },
  2,
);

const vibeWorker = makeWorker<VibeProspectJob | VibeProspectBulkJob>(
  QueueName.VIBE,
  async (name, data) => {
    if (name === JobName.VIBE_PROSPECT)
      return runVibeProspect(data as VibeProspectJob);
    if (name === JobName.VIBE_PROSPECT_BULK)
      return runVibeProspectBulk(data as VibeProspectBulkJob);
    logger.warn({ name }, "unknown vibe job");
  },
  3,
);

async function shutdown(sig: string): Promise<void> {
  logger.info({ sig }, "shutting down");
  await Promise.all([
    searchWorker.close(),
    scoringWorker.close(),
    enrichmentWorker.close(),
    crmWorker.close(),
    outreachWorker.close(),
    systemWorker.close(),
    vibeWorker.close(),
  ]);
  await connection.quit();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// Provider ToS compliance: cached data must be purged on a schedule.
// Google: 30-day max retention. Yelp: 24-hour max retention.
// Runs on boot and every 1 hour thereafter (Yelp is the tightest window).
void runComplianceCleanup();
const complianceTimer = setInterval(
  () => void runComplianceCleanup(),
  60 * 60 * 1000,
);
complianceTimer.unref();

// Billing dunning: retry failed payments, escalate overdue invoices.
// Runs on boot and every 24 hours thereafter.
void runBillingDunning();
const dunningTimer = setInterval(
  () => void runBillingDunning(),
  24 * 60 * 60 * 1000,
);
dunningTimer.unref();

// Weekly digest: AI-generated summary email per org.
// Runs every 24 hours; per-org guard prevents resending within 6 days, so
// the effective cadence is weekly without needing cron.
void runWeeklyDigest();
const digestTimer = setInterval(
  () => void runWeeklyDigest(),
  24 * 60 * 60 * 1000,
);
digestTimer.unref();

// Recurring-search scheduler: enqueues `search.ingest` for every Search
// row whose `nextRunAt` has elapsed. Polls once per minute by default.
startScheduler();

logger.info("crawlix worker started");
