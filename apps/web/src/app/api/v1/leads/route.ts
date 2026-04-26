import { NextResponse } from 'next/server';
import { LeadFilterSchema } from '@crawlix/shared';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { leadsService } from '@/server/services/leads.service';

export async function GET(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx)) return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = LeadFilterSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid filter', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }
  const result = await leadsService.list(ctx.orgId, parsed.data);
  return NextResponse.json(result);
}
