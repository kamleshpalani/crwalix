import { notFound } from "next/navigation";
import { crmService } from "@/server/services/crm.service";
import { renderProposalPrintHtml } from "@/server/services/proposal-print";

export const dynamic = "force-dynamic";

/**
 * Public PDF / print view. Resolves the proposal by share token, then
 * returns the same auto-print HTML used by the authenticated route.
 * Streams as a route handler-style Response from a Server Component
 * is not supported, so we use a route segment with a Response.
 */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const proposal = await crmService.getPublicProposal(params.token);
  if (!proposal) notFound();

  const html = renderProposalPrintHtml({
    organizationName: proposal.organizationName,
    dealTitle: proposal.dealTitle,
    version: proposal.version,
    status: proposal.status,
    bodyHtml: proposal.bodyHtml,
    createdAt: proposal.createdAt,
  });

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
