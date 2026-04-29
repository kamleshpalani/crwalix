// apps/web/src/server/services/sequence.service.ts
//
// Phase 1.6 — outreach cadences (sequences).
//
// Authoring lives here (CRUD on Sequence + SequenceStep). Run dispatch is a
// thin wrapper that creates a SequenceRun row and enqueues the first
// `outreach.sequenceTick` job; the worker takes it from there.

import { withOrg } from "@crawlix/db";
import {
  JobName,
  QueueName,
  SequenceStatus,
  SequenceRunStatus,
  type CreateSequenceInput,
  type OutreachSequenceTickJob,
  type StartSequenceRunInput,
} from "@crawlix/shared";
import { enqueue } from "@/lib/queue";

export const sequenceService = {
  /** Create a sequence template + ordered steps. Idempotent on (org, name). */
  async create(
    orgId: string,
    userId: string | null,
    input: CreateSequenceInput,
  ) {
    return withOrg(orgId, async (tx) => {
      const seq = await tx.sequence.create({
        data: {
          organizationId: orgId,
          name: input.name,
          description: input.description ?? null,
          status: input.status ?? SequenceStatus.DRAFT,
          fromEmail: input.fromEmail ?? null,
          replyToEmail: input.replyToEmail ?? null,
          quietStartHour: input.quietStartHour ?? null,
          quietEndHour: input.quietEndHour ?? null,
          timezone: input.timezone ?? null,
          createdById: userId,
        },
      });
      // Re-stamp positions sequentially so the worker can rely on them.
      const steps = [...input.steps].sort((a, b) => a.position - b.position);
      await tx.sequenceStep.createMany({
        data: steps.map((s, idx) => ({
          organizationId: orgId,
          sequenceId: seq.id,
          position: idx,
          delayHours: s.delayHours,
          subjectTemplate: s.subjectTemplate,
          bodyTemplate: s.bodyTemplate,
          bodyIsHtml: s.bodyIsHtml ?? false,
        })),
      });
      return tx.sequence.findUniqueOrThrow({
        where: { id: seq.id },
        include: { steps: { orderBy: { position: "asc" } } },
      });
    });
  },

  /** List all sequences for the org with their step counts. */
  async list(orgId: string) {
    return withOrg(orgId, async (tx) => {
      return tx.sequence.findMany({
        orderBy: { createdAt: "desc" },
        include: { steps: { orderBy: { position: "asc" } } },
      });
    });
  },

  /** Soft archive a sequence. Existing runs continue until completion. */
  async archive(orgId: string, sequenceId: string) {
    return withOrg(orgId, (tx) =>
      tx.sequence.update({
        where: { id: sequenceId },
        data: { status: SequenceStatus.ARCHIVED },
      }),
    );
  },

  /**
   * Spawn a SequenceRun against a recipient and enqueue the first tick.
   * Refuses to start a run for a sequence that is not ACTIVE so accidental
   * sends from drafts can't ship.
   */
  async start(
    orgId: string,
    userId: string | null,
    input: StartSequenceRunInput,
  ) {
    const run = await withOrg(orgId, async (tx) => {
      const seq = await tx.sequence.findUnique({
        where: { id: input.sequenceId },
      });
      if (!seq) throw new Error("sequence not found");
      if (seq.status !== SequenceStatus.ACTIVE) {
        throw new Error(
          "sequence is not ACTIVE — activate it before starting runs",
        );
      }
      const stepCount = await tx.sequenceStep.count({
        where: { sequenceId: seq.id },
      });
      if (stepCount === 0) {
        throw new Error("sequence has no steps");
      }
      return tx.sequenceRun.create({
        data: {
          organizationId: orgId,
          sequenceId: seq.id,
          leadId: input.leadId ?? null,
          dealId: input.dealId ?? null,
          toEmail: input.toEmail,
          status: SequenceRunStatus.RUNNING,
          currentStepIndex: 0,
          nextRunAt: new Date(),
          vars: (input.vars ?? {}) as never,
          createdById: userId,
        },
      });
    });

    // Fire-and-forget the first tick. The worker handles compliance,
    // suppression, sending, and scheduling subsequent steps.
    await enqueue(
      QueueName.OUTREACH,
      JobName.OUTREACH_SEQUENCE_TICK,
      {
        organizationId: orgId,
        sequenceRunId: run.id,
      } satisfies OutreachSequenceTickJob,
      { jobId: `outreach-tick:${run.id}:0` },
    );

    return run;
  },

  /** Halt a run (idempotent). The worker checks status before each tick. */
  async stop(orgId: string, runId: string, reason?: string) {
    return withOrg(orgId, (tx) =>
      tx.sequenceRun.update({
        where: { id: runId },
        data: {
          status: SequenceRunStatus.STOPPED,
          pausedAt: new Date(),
          pauseReason: reason ?? null,
          nextRunAt: null,
        },
      }),
    );
  },
};
