// packages/outreach/src/index.ts
// Phase 1.5 — Outreach package.
//
// Layered on top of `@crawlix/email`. Adds:
//   - Mustache-lite template rendering (`{{lead.name}}`).
//   - HMAC-signed unsubscribe tokens (verified at /api/v1/outreach/unsubscribe).
//   - Tracking pixel URL builder (open beacons hit /api/v1/outreach/track/open/[id]).
//   - Suppression check (compares sha256(lower(email)) to OutreachSuppression.emailHash).
//   - Compliance footer composer (sender identity + physical address + opt-out).
//
// Higher-level "send and persist" orchestration (creating OutreachMessage rows,
// recording open/bounce/reply timestamps) lives in the consuming app —
// typically the worker — so this package stays Prisma-free.

import { sendEmail, type EmailSendResult } from "@crawlix/email";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// ---------- Types ------------------------------------------------------------

export interface OutreachSettingsInput {
  senderName: string | null;
  senderCompany: string | null;
  senderEmail: string | null;
  replyToEmail?: string | null;
  mailingAddress: string | null;
  unsubscribeUrl?: string | null;
  citeProviderInBody?: boolean | null;
}

export interface OutreachComplianceCheck {
  ok: boolean;
  /** Human-readable reason when `ok === false`. */
  reason?: string;
}

export interface RenderedOutreach {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export interface BuildOutreachInput {
  /** Plain-text or HTML body template; `{{var}}` placeholders are expanded. */
  body: string;
  /** Subject template; same placeholder syntax. */
  subject: string;
  /** Variables exposed to the template. Nested objects via dot notation. */
  vars?: Record<string, unknown>;
  /** When `true`, body is treated as raw HTML; otherwise wrapped in <p> tags. */
  bodyIsHtml?: boolean;
  settings: OutreachSettingsInput;
  /** OutreachMessage id — used for tracking pixel + unsubscribe token. */
  messageId: string;
  /** Recipient address — required for unsubscribe token + suppression. */
  toEmail: string;
  /** Org id — required for unsubscribe token. */
  organizationId: string;
  /** Absolute base URL for tracking + unsubscribe links (e.g. https://app.crawlix). */
  appBaseUrl: string;
  /** HMAC secret used to sign unsubscribe tokens. */
  signingSecret: string;
}

export interface DispatchOutreachInput extends BuildOutreachInput {
  fromEmail: string;
  /** Reply-To header — defaults to `fromEmail`. */
  replyTo?: string;
}

// ---------- Compliance pre-flight -------------------------------------------

/**
 * Refuses to dispatch outreach when the org is missing CAN-SPAM-mandated
 * sender identity or a working unsubscribe path. Call this before persisting
 * the OutreachMessage row.
 */
export function checkOutreachCompliance(
  settings: OutreachSettingsInput | null | undefined,
): OutreachComplianceCheck {
  if (!settings) {
    return {
      ok: false,
      reason: "Outreach settings not configured for this organization.",
    };
  }
  if (!settings.senderEmail) {
    return { ok: false, reason: "Sender email is required (CAN-SPAM)." };
  }
  if (!settings.senderName && !settings.senderCompany) {
    return {
      ok: false,
      reason: "Sender name or company is required (CAN-SPAM).",
    };
  }
  if (!settings.mailingAddress) {
    return {
      ok: false,
      reason: "Physical mailing address is required (CAN-SPAM).",
    };
  }
  return { ok: true };
}

// ---------- Suppression ------------------------------------------------------

/** sha256(lower(email)) — matches the `emailHash` column in OutreachSuppression. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

// ---------- Templates --------------------------------------------------------

const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Resolves dot-notation paths against a vars bag. Missing values render as
 * an empty string rather than `undefined` so half-rendered templates are
 * never sent.
 */
function lookupVar(vars: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let cur: unknown = vars;
  for (const part of parts) {
    if (
      cur &&
      typeof cur === "object" &&
      part in (cur as Record<string, unknown>)
    ) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return "";
    }
  }
  if (cur === null || cur === undefined) return "";
  return String(cur);
}

export function renderTemplate(
  tpl: string,
  vars: Record<string, unknown> = {},
): string {
  return tpl.replace(PLACEHOLDER_RE, (_, path: string) =>
    lookupVar(vars, path),
  );
}

// ---------- Unsubscribe tokens ----------------------------------------------

/**
 * Mints a one-way HMAC token of `orgId:email`. Verified server-side at the
 * unsubscribe endpoint — no DB lookup required to validate authenticity.
 */
export function mintUnsubscribeToken(
  organizationId: string,
  email: string,
  secret: string,
): string {
  const payload = `${organizationId}:${email.trim().toLowerCase()}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  // base64url(payload).sig — keeps URL shape compact and copy-paste safe.
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return `${encoded}.${sig}`;
}

export interface VerifiedUnsubscribe {
  organizationId: string;
  email: string;
}

export function verifyUnsubscribeToken(
  token: string,
  secret: string,
): VerifiedUnsubscribe | null {
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const colon = payload.indexOf(":");
  if (colon < 0) return null;
  return {
    organizationId: payload.slice(0, colon),
    email: payload.slice(colon + 1),
  };
}

// ---------- URL helpers ------------------------------------------------------

function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export function trackingPixelUrl(
  appBaseUrl: string,
  messageId: string,
): string {
  return joinUrl(
    appBaseUrl,
    `/api/v1/outreach/track/open/${encodeURIComponent(messageId)}`,
  );
}

export function unsubscribeUrl(
  appBaseUrl: string,
  organizationId: string,
  email: string,
  secret: string,
): string {
  const token = mintUnsubscribeToken(organizationId, email, secret);
  return joinUrl(
    appBaseUrl,
    `/api/v1/outreach/unsubscribe?token=${encodeURIComponent(token)}`,
  );
}

// ---------- Body composition -------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replaceAll("\n", "<br>")}</p>`)
    .join("\n");
}

function buildFooterHtml(
  settings: OutreachSettingsInput,
  unsubUrl: string,
): string {
  const sender = settings.senderName ?? settings.senderCompany ?? "";
  const company = settings.senderCompany ?? "";
  const address = settings.mailingAddress ?? "";
  const lines: string[] = [];
  if (sender) lines.push(escapeHtml(sender));
  if (company && company !== sender) lines.push(escapeHtml(company));
  if (address) lines.push(escapeHtml(address));
  const identity = lines.join("<br>");
  return [
    `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px">`,
    `<div style="font:12px/1.5 system-ui,-apple-system,sans-serif;color:#64748b">`,
    identity ? `<div style="margin-bottom:8px">${identity}</div>` : "",
    `<div>`,
    `You're receiving this because we believe it's relevant to your business. `,
    `<a href="${escapeHtml(unsubUrl)}" style="color:#64748b;text-decoration:underline">Unsubscribe</a>`,
    `</div>`,
    `</div>`,
  ].join("");
}

/**
 * Renders subject + body, expanding `{{vars}}`, appending a tracking pixel
 * and a CAN-SPAM-compliant footer with the unsubscribe link. Returns both
 * HTML and a plain-text fallback.
 */
export function buildOutreach(input: BuildOutreachInput): RenderedOutreach {
  const subject = renderTemplate(input.subject, input.vars ?? {});
  const renderedBody = renderTemplate(input.body, input.vars ?? {});
  const bodyHtmlOnly = input.bodyIsHtml
    ? renderedBody
    : textToHtml(renderedBody);

  const unsub = input.settings.unsubscribeUrl?.trim()
    ? input.settings.unsubscribeUrl
    : unsubscribeUrl(
        input.appBaseUrl,
        input.organizationId,
        input.toEmail,
        input.signingSecret,
      );

  const pixel = `<img src="${escapeHtml(
    trackingPixelUrl(input.appBaseUrl, input.messageId),
  )}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">`;

  const footer = buildFooterHtml(input.settings, unsub);
  const bodyHtml = `${bodyHtmlOnly}\n${footer}\n${pixel}`;
  const bodyText = `${htmlToText(bodyHtmlOnly)}\n\n--\nUnsubscribe: ${unsub}`;
  return { subject, bodyHtml, bodyText };
}

// ---------- Dispatch ---------------------------------------------------------

export interface OutreachDispatchResult extends EmailSendResult {
  rendered: RenderedOutreach;
}

/**
 * Renders + sends an outreach email through `@crawlix/email`. Persistence
 * (OutreachMessage row, suppression check, compliance gate) is the caller's
 * responsibility — this function just composes and ships.
 */
export async function dispatchOutreach(
  input: DispatchOutreachInput,
): Promise<OutreachDispatchResult> {
  const rendered = buildOutreach(input);
  const result = await sendEmail({
    to: input.toEmail,
    from: input.fromEmail,
    replyTo: input.replyTo ?? input.fromEmail,
    subject: rendered.subject,
    html: rendered.bodyHtml,
    text: rendered.bodyText,
    headers: {
      // RFC 8058 one-click unsubscribe — most major mailbox providers honor this.
      "List-Unsubscribe": `<${unsubscribeUrl(
        input.appBaseUrl,
        input.organizationId,
        input.toEmail,
        input.signingSecret,
      )}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  return { ...result, rendered };
}
