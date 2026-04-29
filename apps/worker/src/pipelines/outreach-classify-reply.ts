// apps/worker/src/pipelines/outreach-classify-reply.ts
//
// Phase 1.8 — AI reply classifier.
//
// Reads the InboundMessage produced by `/api/v1/outreach/inbound`, calls the
// AI router with the `reply.classify` task, persists the verdict, and
// auto-advances the originating Deal stage when the verdict is decisive:
//   - INTERESTED         → bump deal to next non-terminal stage (if any)
//   - NOT_INTERESTED     → close deal as LOST (move to first lost stage)
//   - UNSUBSCRIBE        → close deal as LOST + add OutreachSuppression entry
//   - OUT_OF_OFFICE      → no stage change (sequence already paused via REPLIED)
//   - QUESTION / OTHER   → no stage change; surfaces in the inbox UI for ops
//
// The deal move is logged as a STAGE_CHANGE Activity with `triggeredBy: "ai"`
// in the metadata, so the timeline reflects who advanced the deal.
//
// Idempotency: re-running on the same InboundMessage is safe — once
// `classifiedAt` is set we short-circuit. The deal-move guard is keyed off
// `processedAt`.

import { prisma, withOrg } from "@crawlix/db";
import { classifyReply, type ReplyVerdict } from "@crawlix/ai";
import { hashEmail } from "@crawlix/outreach";
import type { OutreachClassifyReplyJob } from "@crawlix/shared";
import { logger } from "../lib/logger";

interface InboundLite {
  id: string;
  organizationId: string;
  outreachMessageId: string | null;
  dealId: string | null;
  leadId: string | null;
  fromEmail: string;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  classifiedAt: Date | null;
  processedAt: Date | null;
}

function stripHtml(html: string): string {
  // Best-effort plaintext fallback. Strips tags + collapses whitespace.
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadInbound(
  inboundMessageId: string,
  orgId: string,
): Promise<InboundLite | null> {
  return withOrg(orgId, (tx) =>
    tx.inboundMessage.findFirst({
      where: { id: inboundMessageId, organizationId: orgId },
      select: {
        id: true,
        organizationId: true,
        outreachMessageId: true,
        dealId: true,
        leadId: true,
        fromEmail: true,
        subject: true,
        bodyText: true,
        bodyHtml: true,
        classifiedAt: true,
        processedAt: true,
      },
    }),
  );
}

async function loadOriginalContext(
  outreachMessageId: string | null,
  orgId: string,
): Promise<{ subject: string | null; snippet: string | null }> {
  if (!outreachMessageId) return { subject: null, snippet: null };
  const row = await withOrg(orgId, (tx) =>
    tx.outreachMessage.findFirst({
      where: { id: outreachMessageId, organizationId: orgId },
      select: { subject: true, bodyText: true, bodyHtml: true },
    }),
  );
  if (!row) return { subject: null, snippet: null };
  const text = row.bodyText ?? (row.bodyHtml ? stripHtml(row.bodyHtml) : "");
  return {
    subject: row.subject ?? null,
    snippet: text ? text.slice(0, 600) : null,
  };
}

interface StageMoveTarget {
  stageId: string;
  isWon: boolean;
  isLost: boolean;
}

/** Resolve the next stage to advance into for the given verdict, or null if no move. */
async function resolveStageMove(
  orgId: string,
  dealId: string,
  verdict: ReplyVerdict,
): Promise<StageMoveTarget | null> {
  const deal = await withOrg(orgId, (tx) =>
    tx.deal.findFirst({
      where: { id: dealId, organizationId: orgId },
      select: { stageId: true, pipelineId: true, closedAt: true },
    }),
  );
  if (!deal || deal.closedAt) return null;

  const stages = await withOrg(orgId, (tx) =>
    tx.pipelineStage.findMany({
      where: { organizationId: orgId, pipelineId: deal.pipelineId },
      orderBy: { position: "asc" },
      select: {
        id: true,
        position: true,
        isWon: true,
        isLost: true,
      },
    }),
  );
  if (!stages.length) return null;

  const current = stages.find((s) => s.id === deal.stageId);
  if (!current) return null;

  if (verdict === "INTERESTED") {
    // Move to the next non-terminal stage strictly after current.
    const next = stages.find(
      (s) => s.position > current.position && !s.isWon && !s.isLost,
    );
    if (!next || next.id === current.id) return null;
    return { stageId: next.id, isWon: next.isWon, isLost: next.isLost };
  }

  if (verdict === "NOT_INTERESTED" || verdict === "UNSUBSCRIBE") {
    const lost = stages.find((s) => s.isLost);
    if (!lost || lost.id === current.id) return null;
    return { stageId: lost.id, isWon: lost.isWon, isLost: lost.isLost };
  }

  return null;
}

async function applyStageMove(
  orgId: string,
  dealId: string,
  target: StageMoveTarget,
  verdict: ReplyVerdict,
  inboundMessageId: string,
): Promise<void> {
  await withOrg(orgId, async (tx) => {
    const existing = await tx.deal.findFirst({
      where: { id: dealId, organizationId: orgId },
      select: { stageId: true, leadId: true, closedAt: true },
    });
    if (!existing || existing.stageId === target.stageId) return;

    const data: Record<string, unknown> = { stageId: target.stageId };
    if (target.isWon) {
      data.status = "WON";
      data.closedAt = data.closedAt ?? new Date();
    } else if (target.isLost) {
      data.status = "LOST";
      data.closedAt = data.closedAt ?? new Date();
    }

    await tx.deal.update({ where: { id: dealId }, data });
    await tx.activity.create({
      data: {
        organizationId: orgId,
        dealId,
        leadId: existing.leadId,
        userId: null,
        kind: "STAGE_CHANGE",
        summary: `Auto-advanced by AI classifier (${verdict})`,
        metadata: {
          fromStageId: existing.stageId,
          toStageId: target.stageId,
          triggeredBy: "ai.classifyReply",
          inboundMessageId,
        } as never,
      },
    });
  });
}

async function suppressEmail(
  orgId: string,
  email: string,
  inboundMessageId: string,
): Promise<void> {
  if (!email) return;
  const emailHash = hashEmail(email);
  await withOrg(orgId, (tx) =>
    tx.outreachSuppression.upsert({
      where: {
        organizationId_emailHash: {
          organizationId: orgId,
          emailHash,
        },
      },
      create: {
        organizationId: orgId,
        emailHash,
        reason: "REPLY_UNSUBSCRIBE",
        source: `inbound:${inboundMessageId}`,
      },
      update: {
        reason: "REPLY_UNSUBSCRIBE",
        source: `inbound:${inboundMessageId}`,
      },
    }),
  );
}

export async function runOutreachClassifyReply(
  job: OutreachClassifyReplyJob,
): Promise<void> {
  const log = logger.child({
    job: "outreach.classifyReply",
    org: job.organizationId,
    inbound: job.inboundMessageId,
  });

  const inbound = await loadInbound(job.inboundMessageId, job.organizationId);
  if (!inbound) {
    log.warn("inbound message not found; skipping");
    return;
  }
  if (inbound.classifiedAt) {
    log.info("already classified; skipping");
    return;
  }

  const replyText =
    inbound.bodyText ?? (inbound.bodyHtml ? stripHtml(inbound.bodyHtml) : "");
  if (!replyText.trim()) {
    log.warn("empty reply body; marking OTHER");
    await prisma.inboundMessage.update({
      where: { id: inbound.id },
      data: {
        classification: "OTHER",
        classificationConfidence: 0,
        classificationReason: "empty body",
        classifiedAt: new Date(),
        processedAt: new Date(),
      },
    });
    return;
  }

  const original = await loadOriginalContext(
    inbound.outreachMessageId,
    inbound.organizationId,
  );

  let verdict: ReplyVerdict = "OTHER";
  let confidence = 0;
  let reason = "";
  try {
    const result = await classifyReply({
      organizationId: inbound.organizationId,
      originalSubject: original.subject,
      originalSnippet: original.snippet,
      replySubject: inbound.subject,
      replyBody: replyText,
    });
    verdict = result.verdict;
    confidence = result.confidence;
    reason = result.reason;
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      "ai classify failed; defaulting to OTHER",
    );
    reason = "ai error";
  }

  await prisma.inboundMessage.update({
    where: { id: inbound.id },
    data: {
      classification: verdict,
      classificationConfidence: confidence,
      classificationReason: reason,
      classifiedAt: new Date(),
    },
  });

  if (verdict === "UNSUBSCRIBE") {
    await suppressEmail(
      inbound.organizationId,
      inbound.fromEmail,
      inbound.id,
    ).catch((err) =>
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "suppress on unsubscribe failed",
      ),
    );
  }

  if (inbound.dealId) {
    const target = await resolveStageMove(
      inbound.organizationId,
      inbound.dealId,
      verdict,
    );
    if (target) {
      await applyStageMove(
        inbound.organizationId,
        inbound.dealId,
        target,
        verdict,
        inbound.id,
      ).catch((err) =>
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "stage move failed",
        ),
      );
    }
  }

  await prisma.inboundMessage.update({
    where: { id: inbound.id },
    data: { processedAt: new Date() },
  });

  log.info({ verdict, confidence }, "reply classified");
}
