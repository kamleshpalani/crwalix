/**
 * Resend (and compatible) inbound email webhook.
 *
 * Phase 1.7 — receives a parsed inbound email, threads it back to the
 * originating `OutreachMessage` via Message-ID / In-Reply-To / References
 * headers, persists an `InboundMessage`, marks the originating outreach +
 * sequence run as REPLIED, fires a `LEAD_REPLIED` notification, and
 * enqueues the AI reply classifier (Phase 1.8).
 *
 * This endpoint is intentionally tenant-agnostic — the org is resolved
 * from the matched OutreachMessage. Unmatched envelopes are dropped with
 * a 200 OK so the upstream provider does not retry.
 *
 * Security:
 *   - Resend signs inbound payloads with Svix headers
 *     (`svix-id`, `svix-timestamp`, `svix-signature`). When
 *     `RESEND_INBOUND_SECRET` is set we verify the HMAC; otherwise the
 *     route accepts all requests (dev mode).
 *   - The endpoint never echoes provider data to unauthenticated clients.
 */
import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { prisma, withOrg } from "@crawlix/db";
import { JobName, QueueName } from "@crawlix/shared";
import { enqueue } from "@/lib/queue";
import { emitNotification } from "@/server/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResendInboundPayload {
  type?: string;
  data?: {
    from?: string | { email?: string; name?: string };
    to?: string | string[] | { email?: string }[];
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string | string[]>;
    /** Resend's parsed Message-Id when available. */
    message_id?: string;
    in_reply_to?: string;
    references?: string | string[];
  };
  // Some providers post the payload at root level instead of `.data`.
  from?: string | { email?: string; name?: string };
  to?: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, string | string[]>;
}

/** Extract `<id@host>` style tokens from `In-Reply-To` / `References`. */
function extractMessageIds(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(" ") : value;
  const matches = raw.match(/<[^<>]+>/g) ?? [];
  return matches.map((m) => m.replace(/[<>]/g, "").trim()).filter(Boolean);
}

function pickHeader(
  headers: Record<string, string | string[]> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const entry =
    headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  if (!entry) return undefined;
  return Array.isArray(entry) ? entry[0] : entry;
}

function pickEmail(
  value:
    | string
    | string[]
    | { email?: string; name?: string }[]
    | { email?: string; name?: string }
    | undefined,
): { email: string; name?: string } {
  if (!value) return { email: "" };
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === "string") {
    // "Name <addr@x.com>" → addr@x.com
    const angle = first.match(/<([^>]+)>/);
    const email = (angle ? angle[1] : first).trim();
    const name = angle
      ? first.replace(angle[0], "").replace(/"/g, "").trim()
      : undefined;
    return { email, name };
  }
  if (first && typeof first === "object") {
    return { email: (first.email ?? "").trim(), name: first.name };
  }
  return { email: "" };
}

/**
 * Verify the Svix signature header used by Resend. Returns true when no
 * secret is configured (dev / smoke tests) or when the signature passes.
 */
function verifySvix(
  rawBody: string,
  headers: Headers,
  secret: string | undefined,
): boolean {
  if (!secret) return true;
  const id = headers.get("svix-id") ?? headers.get("webhook-id");
  const ts = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const sig = headers.get("svix-signature") ?? headers.get("webhook-signature");
  if (!id || !ts || !sig) return false;
  const signedPayload = `${id}.${ts}.${rawBody}`;
  // Svix secret format: `whsec_<base64>`.
  const key = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret, "utf8");
  const expected = crypto
    .createHmac("sha256", key)
    .update(signedPayload)
    .digest("base64");
  // Header format: "v1,sig1 v1,sig2" — accept any match.
  return sig
    .split(" ")
    .map((s) => s.split(",")[1])
    .filter(Boolean)
    .some((candidate) => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(candidate, "base64"),
          Buffer.from(expected, "base64"),
        );
      } catch {
        return false;
      }
    });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifySvix(rawBody, req.headers, process.env.RESEND_INBOUND_SECRET)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: ResendInboundPayload;
  try {
    body = JSON.parse(rawBody) as ResendInboundPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const data = body.data ?? body;
  const from = pickEmail(data.from);
  const to = pickEmail(data.to as never);
  const subject = (data.subject ?? "").slice(0, 998);
  const bodyText = data.text ?? null;
  const bodyHtml = data.html ?? null;
  const headers = data.headers;

  const ourMessageId =
    data.message_id ?? pickHeader(headers, "message-id") ?? null;
  const inReplyToHeader =
    data.in_reply_to ?? pickHeader(headers, "in-reply-to") ?? null;
  const referencesHeader =
    pickHeader(headers, "references") ??
    (Array.isArray(data.references)
      ? data.references.join(" ")
      : data.references) ??
    null;

  const candidateIds = Array.from(
    new Set([
      ...extractMessageIds(inReplyToHeader ?? undefined),
      ...extractMessageIds(referencesHeader ?? undefined),
    ]),
  );

  // Match back to an OutreachMessage by providerId (Resend message id).
  const matched = candidateIds.length
    ? await prisma.outreachMessage.findFirst({
        where: { providerId: { in: candidateIds } },
        select: {
          id: true,
          organizationId: true,
          leadId: true,
          dealId: true,
          sequenceRunId: true,
        },
      })
    : null;

  if (!matched) {
    // Drop quietly with 202 so the provider does not retry.
    return NextResponse.json({ ok: true, matched: false }, { status: 202 });
  }

  const orgId = matched.organizationId;
  const now = new Date();

  const inbound = await withOrg(orgId, async (tx) => {
    const row = await tx.inboundMessage.create({
      data: {
        organizationId: orgId,
        outreachMessageId: matched.id,
        sequenceRunId: matched.sequenceRunId,
        leadId: matched.leadId,
        dealId: matched.dealId,
        fromEmail: from.email || "",
        fromName: from.name ?? null,
        toEmail: to.email || "",
        subject,
        providerMessageId: ourMessageId,
        inReplyTo: inReplyToHeader,
        references: referencesHeader,
        bodyText,
        bodyHtml,
        rawPayload: body as never,
        receivedAt: now,
      },
      select: { id: true },
    });

    await tx.outreachMessage.update({
      where: { id: matched.id },
      data: { status: "REPLIED", repliedAt: now },
    });

    if (matched.sequenceRunId) {
      await tx.sequenceRun.update({
        where: { id: matched.sequenceRunId },
        data: { status: "REPLIED" },
      });
    }

    return row;
  });

  // Best-effort downstream effects — never block the webhook ack.
  await emitNotification({
    organizationId: orgId,
    kind: "LEAD_REPLIED" as never,
    title: "New reply received",
    body: `${from.email || "Someone"} replied: ${subject || "(no subject)"}`,
    href: matched.dealId ? `/crm/deals/${matched.dealId}` : undefined,
    data: {
      inboundMessageId: inbound.id,
      outreachMessageId: matched.id,
      leadId: matched.leadId,
      dealId: matched.dealId,
    },
  }).catch(() => {});

  await enqueue(
    QueueName.OUTREACH,
    JobName.OUTREACH_CLASSIFY_REPLY,
    {
      organizationId: orgId,
      inboundMessageId: inbound.id,
    },
    { jobId: `outreach-classify:${inbound.id}` },
  ).catch(() => {});

  return NextResponse.json(
    { ok: true, matched: true, inboundMessageId: inbound.id },
    { status: 200 },
  );
}
