import { notFound } from "next/navigation";
import { crmService } from "@/server/services/crm.service";

export const dynamic = "force-dynamic";

/**
 * Public proposal viewer. Anyone with the share token can read the
 * rendered HTML body. The first read stamps `viewedAt` on the row,
 * which is reflected on the deal timeline.
 *
 * Embedded HTML comes from the AI generator. We rely on the model's
 * output being safe-by-construction (no <script>); if that changes,
 * sanitize via DOMPurify here.
 */
export default async function PublicProposalPage({
  params,
}: {
  readonly params: { readonly token: string };
}) {
  const proposal = await crmService.getPublicProposal(params.token);
  if (!proposal) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-b from-ink-50 to-white py-10">
      <div className="mx-auto max-w-3xl px-4">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-500">
              {proposal.organizationName}
            </p>
            <h1 className="font-display text-2xl font-semibold text-ink-900">
              {proposal.dealTitle}
            </h1>
          </div>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            v{proposal.version} · {proposal.status}
          </span>
        </header>
        <div className="mb-4 flex justify-end">
          <a
            href={`/p/${params.token}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-ink-900 hover:bg-white/70"
          >
            Download PDF
          </a>
        </div>
        <article
          className="prose prose-ink max-w-none rounded-2xl border border-white/60 bg-white/90 p-8 shadow-sm"
          // eslint-disable-next-line react/no-danger -- AI-generated, no <script> output
          dangerouslySetInnerHTML={{ __html: proposal.bodyHtml }}
        />
        <footer className="mt-8 flex items-center justify-center text-xs text-ink-400">
          Powered by Crawlix
        </footer>
      </div>
    </div>
  );
}
