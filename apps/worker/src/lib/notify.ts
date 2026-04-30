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
import { prisma } from "@crawlix/db";
import { sendEmail as deliverEmail } from "@crawlix/email";
import { logger } from "./logger";

const log = logger.child({ component: "notify" });

export interface NotificationInput {
  organizationId: string;
  /**
   * Notification kind — common dot-notation values are mirrored from
   * `apps/web/src/server/services/notification-kinds.ts`. The DB column is
   * a free `String`, so any new value is allowed; the union is here only
   * to prompt autocomplete for the canonical kinds.
   */
  kind:
    | "LEADS_DISCOVERED"
    | "SEARCH_FAILED"
    | "LEAD_REPLIED"
    | "LEAD_HIGH_PRIORITY"
    | "ENRICHMENT_COMPLETE"
    | "CAMPAIGN_SENT"
    | "INVOICE_OVERDUE"
    | "SUBSCRIPTION_RENEWAL_DUE"
    | (string & {});
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
        data: input.data as never,
      },
      select: { id: true },
    });
  } catch (err) {
    log.error({ err: errMsg(err) }, "notify: failed to persist row");
    return; // Without the row there's nothing reasonable to do downstream.
  }

  // 2. Look up org delivery channels.
  const org = await prisma.organization
    .findUnique({
      where: { id: input.organizationId },
      select: {
        notificationWebhookUrl: true,
        notificationEmail: true,
        name: true,
      },
    })
    .catch(() => null);

  // 3. Fire webhook (Slack-compatible payload).
  if (org?.notificationWebhookUrl) {
    void fireWebhook(org.notificationWebhookUrl, input).catch((err) =>
      log.error(
        { err: errMsg(err), notificationId: row!.id },
        "webhook dispatch failed",
      ),
    );
  }

  // 4. Email digest stub.
  if (org?.notificationEmail) {
    void sendEmailDigest(org.notificationEmail, input).catch((err) =>
      log.error(
        { err: errMsg(err), notificationId: row!.id },
        "email dispatch failed",
      ),
    );
  }
}

async function fireWebhook(
  url: string,
  input: NotificationInput,
): Promise<void> {
  // Slack incoming webhooks accept `{ text }`. Generic webhooks see the full
  // structured payload too.
  const payload = {
    text: `*${input.title}*\n${input.body}${input.href ? `\n<${input.href}>` : ""}`,
    kind: input.kind,
    title: input.title,
    body: input.body,
    href: input.href,
    data: input.data ?? null,
    timestamp: new Date().toISOString(),
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      log.warn({ status: res.status, url }, "webhook returned non-2xx");
    }
  } finally {
    clearTimeout(t);
  }
}

async function sendEmailDigest(
  to: string,
  input: NotificationInput,
): Promise<void> {
  const link = input.href ? absoluteUrl(input.href) : undefined;
  const text = link
    ? `${input.body}\n\nOpen: ${link}\n\n— Crawlix`
    : `${input.body}\n\n— Crawlix`;
  const html = renderHtml(input, link);
  const res = await deliverEmail({
    to,
    subject: `[Crawlix] ${input.title}`,
    text,
    html,
  });
  if (!res.ok) {
    log.warn(
      { provider: res.provider, error: res.error, to },
      "email send failed",
    );
  } else {
    log.info(
      { provider: res.provider, id: res.id, to, kind: input.kind },
      "email sent",
    );
  }
}

function renderHtml(input: NotificationInput, link?: string): string {
  const safeTitle = escapeHtml(input.title);
  const safeBody = escapeHtml(input.body);
  const linkBlock = link
    ? `<p style="margin-top:16px"><a href="${escapeHtml(link)}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px">Open in Crawlix</a></p>`
    : "";
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;background:#f8fafc;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
      <h1 style="font-size:18px;margin:0 0 12px">${safeTitle}</h1>
      <p style="font-size:14px;line-height:1.6;margin:0">${safeBody}</p>
      ${linkBlock}
      <p style="margin-top:24px;font-size:11px;color:#94a3b8">Sent by Crawlix · ${escapeHtml(input.kind)}</p>
    </div>
  </body></html>`;
}

function absoluteUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${href.startsWith("/") ? href : `/${href}`}`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
