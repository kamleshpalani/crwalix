import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import NoOrgBanner from '@/components/NoOrgBanner';
import { withOrg } from '@crawlix/db';

export default async function LeadsPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const leads = await withOrg(ctx.orgId, (tx) =>
    tx.lead.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { scores: { take: 1, orderBy: { createdAt: 'desc' } } }
    })
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <span className="text-sm text-slate-500">{leads.length} total</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Enriched and scored local-business leads.
      </p>

      <ul className="mt-6 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
        {leads.length === 0 && (
          <li className="p-4 text-sm text-slate-500">
            No leads yet. Run a search to ingest leads.
          </li>
        )}
        {leads.map((l) => (
          <li key={l.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-slate-500">
                  {[l.categoryPrimary, l.city, l.country].filter(Boolean).join(' · ')}
                </div>
              </div>
              {l.scores[0] && (
                <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
                  {l.scores[0].score}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
