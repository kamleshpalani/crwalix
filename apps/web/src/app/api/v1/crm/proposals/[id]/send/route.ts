/**
 * POST /api/v1/crm/proposals/[id]/send
 *
 * Sends a proposal to a client via email. The proposal must be in DRAFT,
 * READY, or SENT status (SENT allows re-sending). On first send the status
 * is transitioned to SENT and a shareToken is minted; subsequent sends reuse
 * the existing token.
 *
 * Body:
 *   { toEmail: string, clientName?: string, subject?: string, message?: string }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@crawlix/db";
import { ProposalStatus } from "@crawlix/shared";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { sendEmail } from "@crawlix/email";
import { crmService } from "@/server/services/crm.service";
import { auditService } from "@/server/services/audit.service";
import { emitNotification } from "@/server/lib/notify";

const Body = z.object({
  toEmail: z.string().email().max(320),
  clientName: z.string().max(200).optional(),
  subject: z.string().max(200).optional(),
  message: z.string().max(1000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON" } },
      { status: 400 },
    );
  }

  const parsed = Body.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid body",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  const { toEmail, clientName, subject, message } = parsed.data;

  // Load proposal with org name for the email.
  const row = await prisma.proposal.findFirst({
    where: { id: params.id, organizationId: ctx.orgId },
    select: {
      id: true,
      organizationId: true,
      dealId: true,
      leadId: true,
      version: true,
      status: true,
      shareToken: true,
    },
  });

  if (!row) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const allowedStatuses: string[] = [
    ProposalStatus.DRAFT,
    ProposalStatus.READY,
    ProposalStatus.SENT,
    ProposalStatus.VIEWED,
  ];
  if (!allowedStatuses.includes(row.status)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_STATUS",
          message: `Cannot send a proposal in ${row.status} status.`,
        },
      },
      { status: 409 },
    );
  }

  // Transition to SENT (mints shareToken on first send; is idempotent after that).
  const updated = await crmService.updateProposal(
    ctx.orgId,
    ctx.userId,
    params.id,
    { status: ProposalStatus.SENT },
  );
  if (!updated) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  // Build the public share URL.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000";
  const shareUrl = updated.shareToken
    ? `${baseUrl}/p/${updated.shareToken}`
    : null;

  // Pull org name for the sender display and deal title for the subject.
  const [org, deal] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { name: true },
    }),
    prisma.deal.findFirst({
      where: { id: row.dealId, organizationId: ctx.orgId },
      select: { title: true },
    }),
  ]);

  const orgName = org?.name ?? "Crawlix";
  const dealTitle = deal?.title ?? "Proposal";
  const greeting = clientName ? `Hi ${clientName},` : "Hi,";
  const customMessage = message ? `\n\n${message}` : "";
  const emailSubject =
    subject ?? `${dealTitle} — Proposal v${updated.version} from ${orgName}`;

  const textBody = shareUrl
    ? `${greeting}\n\nPlease find your proposal below.${customMessage}\n\nView proposal: ${shareUrl}\n\n— ${orgName}`
    : `${greeting}\n\nYour proposal (v${updated.version}) has been prepared.${customMessage}\n\n— ${orgName}`;

  const htmlBody = shareUrl
    ? `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Proposal</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;background:#f8fafc;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:40px">
    <p style="margin:0 0 16px">${greeting}</p>
    <p style="margin:0 0 16px">Please find your proposal below.${customMessage ? `</p><p style="margin:0 0 16px">${message}` : ""}</p>
    <p style="margin:24px 0">
      <a href="${shareUrl}" style="background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block">
        View Proposal →
      </a>
    </p>
    <p style="margin:24px 0 0;font-size:12px;color:#64748b">— ${orgName}</p>
  </div>
</body></html>`
    : `<p>${greeting}</p><p>Your proposal (v${updated.version}) has been prepared.</p><p>— ${orgName}</p>`;

  const sendResult = await sendEmail({
    to: toEmail,
    subject: emailSubject,
    text: textBody,
    html: htmlBody,
  });

  void auditService.record({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "proposal.send",
    target: row.id,
    metadata: {
      toEmail,
      dealId: row.dealId,
      version: row.version,
      emailProvider: sendResult.provider,
      emailOk: sendResult.ok,
    },
  });

  void emitNotification({
    organizationId: ctx.orgId,
    kind: "PROPOSAL_SENT",
    title: `Proposal v${updated.version} sent to ${toEmail}`,
    body: `${dealTitle} proposal delivered via ${sendResult.provider}.`,
    href: `/pipeline?dealId=${row.dealId}`,
    data: { proposalId: row.id, dealId: row.dealId, toEmail },
  });

  return NextResponse.json(
    {
      proposal: updated,
      email: {
        ok: sendResult.ok,
        provider: sendResult.provider,
        error: sendResult.error ?? null,
      },
    },
    { status: 200 },
  );
}
