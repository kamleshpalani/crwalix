import { NextResponse } from 'next/server';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { searchesService } from '@/server/services/searches.service';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx)) return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const search = await searchesService.get(ctx.orgId, params.id);
  if (!search) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Search not found' } }, { status: 404 });
  }
  return NextResponse.json({ search });
}
