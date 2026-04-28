import { NextResponse } from 'next/server';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { exportsService } from '@/server/services/exports.service';
import { leadsService } from '@/server/services/leads.service';
import { leadsToCsv } from '@/server/services/csv';
import { LeadFilterSchema } from '@crawlix/shared';

const MAX_ROWS = 10_000;
// Schema-enforced upper bound on a single list() page.
const PAGE_SIZE = 200;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx)) return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const job = await exportsService.get(ctx.orgId, params.id);
  if (!job) {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  }

  // Build the filter from the export-job's source columns.
  const baseFilter: Record<string, unknown> = { page: 1, pageSize: PAGE_SIZE, sort: '-score' };
  if (job.searchId) baseFilter.searchId = job.searchId;
  if (job.projectId) baseFilter.projectId = job.projectId;
  if (job.listId) baseFilter.listId = job.listId;
  if (job.filterJson && typeof job.filterJson === 'object') {
    Object.assign(baseFilter, job.filterJson);
  }
  // Always force our own pagination — never trust whatever pageSize was
  // persisted on the filter (older jobs could have stored 10_000 here, which
  // the LeadFilterSchema rightly rejects).
  baseFilter.page = 1;
  baseFilter.pageSize = PAGE_SIZE;

  const parsed = LeadFilterSchema.safeParse(baseFilter);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_FILTER', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  // Page through results until we hit MAX_ROWS or run out.
  const collected: Awaited<ReturnType<typeof leadsService.list>>['items'] = [];
  let page = 1;
  while (collected.length < MAX_ROWS) {
    const filter = { ...parsed.data, page, pageSize: PAGE_SIZE };
    const { items, total } = await leadsService.list(ctx.orgId, filter);
    collected.push(...items);
    if (items.length < PAGE_SIZE) break;
    if (collected.length >= total) break;
    page += 1;
  }
  const rows = collected.slice(0, MAX_ROWS);
  const csv = leadsToCsv(rows);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="crawlix-export-${job.id}.csv"`,
      'cache-control': 'no-store'
    }
  });
}
