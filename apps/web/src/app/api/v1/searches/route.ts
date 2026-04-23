import { NextResponse } from 'next/server';
import { CreateSearchSchema } from '@crawlix/shared';
import { requireOrg, isResponse } from '@/lib/auth';
import { searchesService } from '@/server/services/searches.service';

export async function GET(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId') ?? undefined;
  const items = await searchesService.list(ctx.orgId, projectId);
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  const body = await req.json().catch(() => ({}));
  const parsed = CreateSearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }
  const out = await searchesService.createAndDispatch(ctx.orgId, ctx.userId, parsed.data);
  return NextResponse.json(out, { status: 202 });
}
