import { NextResponse } from "next/server";
import { withOrg } from "@crawlix/db";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { renderProposalPrintHtml } from "@/server/services/proposal-print";

/**
 * Authenticated print/PDF view of a proposal. Returns an HTML page styled
 * for A4 that auto-opens the browser print dialog so the user can
 * "Save as PDF". See `proposal-print.ts` for the rationale.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const data = await withOrg(ctx.orgId, async (tx) => {
    const proposal = await tx.proposal.findFirst({
      where: { id: params.id, organizationId: ctx.orgId },
    });
    if (!proposal) return null;
    const deal = await tx.deal.findFirst({
      where: { id: proposal.dealId, organizationId: ctx.orgId },
      select: { title: true },
    });
    const org = await tx.organization.findFirst({
      where: { id: ctx.orgId },
      select: { name: true },
    });
    return {
      organizationName: org?.name ?? "",
      dealTitle: deal?.title ?? "Proposal",
      version: proposal.version,
      status: proposal.status,
      bodyHtml: proposal.bodyHtml,
      createdAt: proposal.createdAt,
    };
  });

  if (!data) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  return new NextResponse(renderProposalPrintHtml(data), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}
