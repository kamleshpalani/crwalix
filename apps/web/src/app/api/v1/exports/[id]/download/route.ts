import { NextResponse } from 'next/server';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { exportsService } from '@/server/services/exports.service';
import { leadsService } from '@/server/services/leads.service';
import { leadsToCsv } from '@/server/services/csv';
import { LeadFilterSchema } from '@crawlix/shared';

const MAX_ROWS = 10_000;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx)) return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const job = await exportsService.get(ctx.orgId, params.id);
  if (!job) {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  }

  // Build the filter from the export-job's source columns.
  const baseFilter: Record<string, unknown> = { page: 1, pageSize: MAX_ROWS, sort: '-score' };
  if (job.searchId) baseFilter.searchId = job.searchId;
  if (job.projectId) baseFilter.projectId = job.projectId;
  if (job.listId) baseFilter.listId = job.listId;
  if (job.filterJson && typeof job.filterJson === 'object') {
    Object.assign(baseFilter, job.filterJson);
    baseFilter.pageSize = MAX_ROWS;
    baseFilter.page = 1;
  }
  const parsed = LeadFilterSchema.safeParse(baseFilter);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_FILTER', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }
  const { items } = await leadsService.list(ctx.orgId, parsed.data);
  const csv = leadsToCsv(items);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="crawlix-export-${job.id}.csv"`,
      'cache-control': 'no-store'
    }
  });
}
