// apps/worker/src/pipelines/outreach-send.ts
//
// Single outbound email dispatcher. Handles:
//   1. Compliance gate (CAN-SPAM sender identity) via OutreachSettings.
//   2. Suppression check against OutreachSuppression.
//   3. Budget check via CostBudget (email monthly limit).
//   4. Persists an OutreachMessage row (status=QUEUED) BEFORE sending so the
//      tracking pixel URL resolves to a real id.
//   5. Renders subject/body via @crawlix/outreach (variables, footer, pixel).
//   6. Dispatches via @crawlix/email.
//   7. Stamps providerId / sentAt / status post-send.
//   8. Records usage to UsageLog.
//
// On failure the row is updated to FAILED with errorMessage; the BullMQ retry
// policy decides whether to re-enqueue. Suppression hits land as SUPPRESSED
// (terminal — never retried). Budget limit hits land as BUDGET_EXCEEDED
// (terminal — never retried until next month).

import { prisma, withOrg, checkEmailBudget } from "@crawlix/db";
import {
  buildOutreach,
  checkOutreachCompliance,
  hashEmail,
} from "@crawlix/outreach";
import { sendEmail } from "@crawlix/email";
import type { OutreachSendJob } from "@crawlix/shared";
import { logger } from "../lib/logger";
import { emitUsage } from "../lib/usage";
import { publishDomainEvent } from "../lib/domain-events";

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  );
}

function signingSecret(): string {
  const s = process.env.OUTREACH_UNSUBSCRIBE_SECRET;
  if (!s) {
    // Fail loud — sending without a verifiable unsubscribe token would
    // strand recipients with no working opt-out path.
    throw new Error("OUTREACH_UNSUBSCRIBE_SECRET is not set");
  }
  return s;
}

export async function runOutreachSend(job: OutreachSendJob): Promise<void> {
  const log = logger.child({ job: "outreach.send", org: job.organizationId });

  // Load org settings + suppression check in one transactional read.
  const ctx = await withOrg(job.organizationId, async (tx) => {
    const settings = await tx.outreachSettings.findUnique({
      where: { organizationId: job.organizationId },
    });
    const suppressed = await tx.outreachSuppression.findUnique({
      where: {
        organizationId_emailHash: {
          organizationId: job.organizationId,
          emailHash: hashEmail(job.toEmail),
        },
      },
    });
    return { settings, suppressed: !!suppressed };
  });

  const compliance = checkOutreachCompliance(ctx.settings);
  if (!compliance.ok) {
    log.warn({ reason: compliance.reason }, "outreach blocked: compliance");
    await recordTerminal(job, "FAILED", compliance.reason ?? "compliance");
    return;
  }
  if (ctx.suppressed) {
    log.info({ to: job.toEmail }, "outreach blocked: suppressed");
    await recordTerminal(job, "SUPPRESSED", "recipient on suppression list");
    return;
  }

  // Budget check (Phase 2: email monthly limit enforcement).
  const budgetCheck = await checkEmailBudget(job.organizationId);
  if (!budgetCheck.allowed) {
    log.warn({ reason: budgetCheck.reason }, "outreach blocked: budget");
    await recordTerminal(job, "FAILED", budgetCheck.reason ?? "budget limit");
    return;
  }

  const fromEmail = job.fromEmail ?? ctx.settings!.senderEmail!;
  const replyTo = job.replyToEmail ?? ctx.settings!.replyToEmail ?? fromEmail;

  // Persist the row first so the tracking pixel id is real on send.
  const message = await withOrg(job.organizationId, (tx) =>
    tx.outreachMessage.create({
      data: {
        organizationId: job.organizationId,
        leadId: job.leadId ?? null,
        dealId: job.dealId ?? null,
        sequenceRunId: job.sequenceRunId ?? null,
        toEmail: job.toEmail,
        fromEmail,
        subject: job.subject, // re-stamped post-render below
        bodyHtml: "", // placeholder, overwritten on success
        status: "QUEUED",
      },
    }),
  );

  const rendered = buildOutreach({
    subject: job.subject,
    body: job.body,
    bodyIsHtml: job.bodyIsHtml ?? false,
    vars: job.vars ?? {},
    settings: ctx.settings!,
    messageId: message.id,
    toEmail: job.toEmail,
    organizationId: job.organizationId,
    appBaseUrl: appBaseUrl(),
    signingSecret: signingSecret(),
  });

  const result = await sendEmail({
    to: job.toEmail,
    from: fromEmail,
    replyTo,
    subject: rendered.subject,
    text: rendered.bodyText,
    html: rendered.bodyHtml,
  });

  await withOrg(job.organizationId, (tx) =>
    tx.outreachMessage.update({
      where: { id: message.id },
      data: {
        subject: rendered.subject,
        bodyHtml: rendered.bodyHtml,
        bodyText: rendered.bodyText,
        provider: result.provider,
        providerId: result.id ?? null,
        status: result.ok ? "SENT" : "FAILED",
        errorMessage: result.ok ? null : (result.error ?? "send failed"),
        sentAt: result.ok ? new Date() : null,
      },
    }),
  );

  if (result.ok) {
    log.info({ id: message.id, provider: result.provider }, "outreach sent");

    // Record usage for billing/metering.
    await withOrg(job.organizationId, (tx) =>
      tx.usageLog.create({
        data: {
          organizationId: job.organizationId,
          kind: "outreach.send",
          units: 1,
          metadata: { provider: result.provider, messageId: message.id },
        },
      }),
    ).catch(() => {
      /* usage logging must never break the send flow */
    });

    void emitUsage({
      organizationId: job.organizationId,
      kind: "email.sent",
      quantity: 1,
      refId: message.id,
      meta: { provider: result.provider },
    });

    // §6 domain event — MessageSent.
    void publishDomainEvent({
      eventName: "MessageSent",
      organizationId: job.organizationId,
      occurredAt: new Date().toISOString(),
      payload: {
        outreachMessageId: message.id,
        toEmail: job.toEmail,
        leadId: job.leadId,
        dealId: job.dealId,
        sequenceRunId: job.sequenceRunId,
      },
    });

    if (job.sequenceRunId) {
      await withOrg(job.organizationId, (tx) =>
        tx.sequenceRun.update({
          where: { id: job.sequenceRunId! },
          data: { lastSendAt: new Date() },
        }),
      );
    }
  } else {
    log.warn({ id: message.id, err: result.error }, "outreach failed");
    // Re-throw so BullMQ retries per the queue's backoff policy. After the
    // final attempt the row stays FAILED.
    throw new Error(result.error ?? "outreach send failed");
  }
}

async function recordTerminal(
  job: OutreachSendJob,
  status: "FAILED" | "SUPPRESSED",
  errorMessage: string,
): Promise<void> {
  await prisma.outreachMessage.create({
    data: {
      organizationId: job.organizationId,
      leadId: job.leadId ?? null,
      dealId: job.dealId ?? null,
      sequenceRunId: job.sequenceRunId ?? null,
      toEmail: job.toEmail,
      fromEmail: job.fromEmail ?? "",
      subject: job.subject,
      bodyHtml: "",
      status,
      errorMessage,
    },
  });
}
