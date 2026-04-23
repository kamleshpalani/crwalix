import { NextResponse } from 'next/server';
import { requireOrg, isResponse } from '@/lib/auth';
import { leadsService } from '@/server/services/leads.service';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  const lead = await leadsService.get(ctx.orgId, params.id);
  if (!lead) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Lead not found' } }, { status: 404 });
  }
  return NextResponse.json({ lead });
}
