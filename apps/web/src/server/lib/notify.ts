/**
 * Web-tier notification emitter. Mirror of `apps/worker/src/lib/notify.ts`
 * for events that originate in HTTP request handlers (deal won, proposal
 * status changes, project kickoff, etc.).
 *
 * Persists a row in the `Notification` feed, then best-effort dispatches
 * to the org's webhook URL. Email is stubbed pending SMTP config. All
 * failures are swallowed so a flaky webhook never blocks the request.
 */
import { prisma } from "@crawlix/db";
import { sendEmail } from "@crawlix/email";

export type CrmNotificationKind =
  | "DEAL_WON"
  | "PROPOSAL_SENT"
  | "PROPOSAL_VIEWED"
  | "PROPOSAL_ACCEPTED"
  | "PROPOSAL_DECLINED"
  | "PROJECT_CREATED"
  | "LEAD_REPLIED";

export interface NotifyInput {
  organizationId: string;
  kind: CrmNotificationKind;
  title: string;
  body: string;
  href?: string;
  data?: Record<string, unknown>;
}

/**
 * Fire-and-forget. Never throws. Awaiting is optional but recommended in
 * server actions so the row is persisted before redirect.
 */
export async function emitNotification(input: NotifyInput): Promise<void> {
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
    console.warn("[notify] failed to persist row", err);
    return;
  }

  const org = await prisma.organization
    .findUnique({
      where: { id: input.organizationId },
      select: { notificationWebhookUrl: true, notificationEmail: true },
    })
    .catch(() => null);

  if (org?.notificationWebhookUrl) {
    void fireWebhook(org.notificationWebhookUrl, input).catch((err) =>
      console.warn("[notify] webhook dispatch failed", row?.id, err),
    );
  }
  if (org?.notificationEmail) {
    void dispatchEmail(org.notificationEmail, input).catch((err) =>
      console.warn("[notify] email dispatch failed", row?.id, err),
    );
  }
}

async function dispatchEmail(to: string, input: NotifyInput): Promise<void> {
  const link = input.href ? absoluteUrl(input.href) : undefined;
  const text = link
    ? `${input.body}\n\nOpen: ${link}\n\n— Crawlix`
    : `${input.body}\n\n— Crawlix`;
  const html = renderHtml(input, link);
  const res = await sendEmail({
    to,
    subject: `[Crawlix] ${input.title}`,
    text,
    html,
  });
  if (!res.ok) {
    console.warn("[notify] email send failed", res.provider, res.error);
  }
}

function renderHtml(input: NotifyInput, link?: string): string {
  const safeTitle = escape(input.title);
  const safeBody = escape(input.body);
  const linkBlock = link
    ? `<p style="margin-top:16px"><a href="${escape(link)}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px">Open in Crawlix</a></p>`
    : "";
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;background:#f8fafc;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
      <h1 style="font-size:18px;margin:0 0 12px">${safeTitle}</h1>
      <p style="font-size:14px;line-height:1.6;margin:0">${safeBody}</p>
      ${linkBlock}
      <p style="margin-top:24px;font-size:11px;color:#94a3b8">Sent by Crawlix · ${escape(input.kind)}</p>
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

function escape(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fireWebhook(url: string, input: NotifyInput): Promise<void> {
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
      console.warn("[notify] webhook non-2xx", res.status, url);
    }
  } finally {
    clearTimeout(t);
  }
}
