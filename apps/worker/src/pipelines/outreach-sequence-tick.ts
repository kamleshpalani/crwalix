// apps/worker/src/pipelines/outreach-sequence-tick.ts
//
// Advances a SequenceRun by one step:
//   1. Reads the run; aborts if it is not RUNNING (REPLIED/PAUSED/STOPPED
//      shut the cadence down).
//   2. Picks the step at currentStepIndex.
//   3. Renders the step's subject + body via @crawlix/outreach (the
//      OUTREACH_SEND worker handles the actual MIME/footer rendering on
//      dispatch — this is just template variable substitution).
//   4. Enqueues an OUTREACH_SEND job referencing the run.
//   5. Increments currentStepIndex and either schedules the next tick or
//      marks the run COMPLETED.
//
// Quiet hours: if the next step's send time falls outside the configured
// [quietStartHour, quietEndHour] window in the sequence's IANA tz, the
// scheduled time is shifted forward to the next quietEndHour.

import { withOrg } from "@crawlix/db";
import { renderTemplate } from "@crawlix/outreach";
import {
  JobName,
  QueueName,
  type OutreachSendJob,
  type OutreachSequenceTickJob,
} from "@crawlix/shared";
import { Queue } from "bullmq";
import { getConnection } from "../lib/redis";
import { logger } from "../lib/logger";

let _outreachQueue: Queue | null = null;
function outreachQueue(): Queue {
  if (!_outreachQueue) {
    _outreachQueue = new Queue(QueueName.OUTREACH, {
      connection: getConnection(),
    });
  }
  return _outreachQueue;
}

/**
 * Returns the hour-of-day (0-23) for `at` rendered in `timezone`. Uses the
 * Intl API rather than a tz library to keep the worker dep-light.
 */
function hourInTz(at: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(at);
  const h = parts.find((p) => p.type === "hour")?.value ?? "0";
  // `hour: numeric / hour12:false` returns "24" at midnight on some runtimes.
  const n = Number.parseInt(h, 10);
  return n === 24 ? 0 : n;
}

/**
 * Pushes `at` forward to the next time that the local hour falls inside
 * [openHour, closeHour). Window may wrap past midnight (e.g. 22→6 means
 * "skip 22:00-05:59").
 */
function applyQuietHours(
  at: Date,
  quietStart: number | null | undefined,
  quietEnd: number | null | undefined,
  timezone: string,
): Date {
  if (quietStart == null || quietEnd == null) return at;
  if (quietStart === quietEnd) return at; // empty window — no-op
  const inQuiet = (h: number): boolean =>
    quietStart < quietEnd
      ? h >= quietStart && h < quietEnd
      : h >= quietStart || h < quietEnd;

  let cursor = at;
  // Bounded loop: at most 24 hourly hops to leave the quiet window.
  for (let i = 0; i < 24; i += 1) {
    if (!inQuiet(hourInTz(cursor, timezone))) return cursor;
    cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
  }
  return cursor;
}

export async function runOutreachSequenceTick(
  job: OutreachSequenceTickJob,
): Promise<void> {
  const log = logger.child({
    job: "outreach.sequenceTick",
    runId: job.sequenceRunId,
  });

  const ctx = await withOrg(job.organizationId, async (tx) => {
    const run = await tx.sequenceRun.findUnique({
      where: { id: job.sequenceRunId },
    });
    if (!run) return null;
    const sequence = await tx.sequence.findUnique({
      where: { id: run.sequenceId },
    });
    if (!sequence) return null;
    const steps = await tx.sequenceStep.findMany({
      where: { sequenceId: run.sequenceId },
      orderBy: { position: "asc" },
    });
    return { run, sequence, steps };
  });

  if (!ctx) {
    log.warn("sequence run or sequence missing");
    return;
  }
  const { run, sequence, steps } = ctx;

  if (run.status !== "RUNNING") {
    log.info({ status: run.status }, "skip — run not RUNNING");
    return;
  }

  const step = steps[run.currentStepIndex];
  if (!step) {
    // No more steps — mark complete.
    await withOrg(job.organizationId, (tx) =>
      tx.sequenceRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          nextRunAt: null,
        },
      }),
    );
    log.info("sequence completed");
    return;
  }

  // Render with the run's persisted vars bag.
  const vars = (run.vars as Record<string, unknown> | null) ?? {};
  const subject = renderTemplate(step.subjectTemplate, vars);
  const body = renderTemplate(step.bodyTemplate, vars);

  const sendPayload: OutreachSendJob = {
    organizationId: job.organizationId,
    toEmail: run.toEmail,
    leadId: run.leadId ?? undefined,
    dealId: run.dealId ?? undefined,
    sequenceRunId: run.id,
    subject,
    body,
    bodyIsHtml: step.bodyIsHtml,
    fromEmail: sequence.fromEmail ?? undefined,
    replyToEmail: sequence.replyToEmail ?? undefined,
    vars,
  };

  await outreachQueue().add(JobName.OUTREACH_SEND, sendPayload, {
    jobId: `outreach-send:${run.id}:${step.position}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86_400 },
  });

  // Advance pointer + schedule next tick.
  const nextStep = steps[run.currentStepIndex + 1];
  if (!nextStep) {
    await withOrg(job.organizationId, (tx) =>
      tx.sequenceRun.update({
        where: { id: run.id },
        data: {
          currentStepIndex: run.currentStepIndex + 1,
          nextRunAt: null,
        },
      }),
    );
    log.info({ pos: step.position }, "step queued; no further steps");
    return;
  }

  const tz = sequence.timezone ?? "UTC";
  const desired = new Date(
    Date.now() + Math.max(0, nextStep.delayHours) * 60 * 60 * 1000,
  );
  const nextRunAt = applyQuietHours(
    desired,
    sequence.quietStartHour,
    sequence.quietEndHour,
    tz,
  );

  await withOrg(job.organizationId, (tx) =>
    tx.sequenceRun.update({
      where: { id: run.id },
      data: {
        currentStepIndex: run.currentStepIndex + 1,
        nextRunAt,
      },
    }),
  );

  await outreachQueue().add(
    JobName.OUTREACH_SEQUENCE_TICK,
    {
      organizationId: job.organizationId,
      sequenceRunId: run.id,
    } satisfies OutreachSequenceTickJob,
    {
      jobId: `outreach-tick:${run.id}:${run.currentStepIndex + 1}`,
      delay: Math.max(0, nextRunAt.getTime() - Date.now()),
      attempts: 5,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: { age: 86_400 },
      removeOnFail: { age: 86_400 },
    },
  );

  log.info(
    { pos: step.position, nextAt: nextRunAt.toISOString() },
    "step queued; next tick scheduled",
  );
}
