/**
 * Notification dispatcher.
 *
 * Single entrypoint the worker pipelines call when something noteworthy
 * happens for an org (e.g. scheduled search inserted N new leads).
 *
 * Side-effects, in order:
 *  1. Insert a row in the `Notification` table (in-app feed).
 *  2. Fire the org's webhook URL, if configured.
 *  3. Log an "email digest" line — real SMTP wiring is intentionally
 *     deferred; replace `sendEmail` with Resend/SES/etc when ready.
 *
 * No call here ever throws — failures are logged so a flaky webhook
 * never blocks the search-ingest pipeline.
 */
import { prisma } from '@crawlix/db';
import { logger } from './logger';

const log = logger.child({ component: 'notify' });

export interface NotificationInput {
  organizationId: string;
  kind: 'LEADS_DISCOVERED' | 'SEARCH_FAILED';
  title: string;
  body: string;
  href?: string;
  data?: Record<string, unknown>;
}

export async function notify(input: NotificationInput): Promise<void> {
  // 1. Persist in-app row.
  let row: { id: string } | null = null;
  try {
    row = await prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        href: input.href,
        data: input.data as never
      },
      select: { id: true }
    });
  } catch (err) {
    log.error({ err: errMsg(err) }, 'notify: failed to persist row');
    return; // Without the row there's nothing reasonable to do downstream.
  }

  // 2. Look up org delivery channels.
  const org = await prisma.organization
    .findUnique({
      where: { id: input.organizationId },
      select: { notificationWebhookUrl: true, notificationEmail: true, name: true }
    })
    .catch(() => null);

  // 3. Fire webhook (Slack-compatible payload).
  if (org?.notificationWebhookUrl) {
    void fireWebhook(org.notificationWebhookUrl, input).catch((err) =>
      log.error({ err: errMsg(err), notificationId: row!.id }, 'webhook dispatch failed')
    );
  }

  // 4. Email digest stub.
  if (org?.notificationEmail) {
    void sendEmail(org.notificationEmail, input).catch((err) =>
      log.error({ err: errMsg(err), notificationId: row!.id }, 'email dispatch failed')
    );
  }
}

async function fireWebhook(url: string, input: NotificationInput): Promise<void> {
  // Slack incoming webhooks accept `{ text }`. Generic webhooks see the full
  // structured payload too.
  const payload = {
    text: `*${input.title}*\n${input.body}${input.href ? `\n<${input.href}>` : ''}`,
    kind: input.kind,
    title: input.title,
    body: input.body,
    href: input.href,
    data: input.data ?? null,
    timestamp: new Date().toISOString()
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    if (!res.ok) {
      log.warn({ status: res.status, url }, 'webhook returned non-2xx');
    }
  } finally {
    clearTimeout(t);
  }
}

async function sendEmail(to: string, input: NotificationInput): Promise<void> {
  // TODO: wire to Resend / SES / Nodemailer when SMTP is configured.
  log.info({ to, kind: input.kind, title: input.title }, '[email-stub] would send');
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
