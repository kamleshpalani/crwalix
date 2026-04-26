import { NextResponse } from 'next/server';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { exportsService, CreateExportSchema } from '@/server/services/exports.service';

export async function GET() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx)) return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const items = await exportsService.list(ctx.orgId);
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx)) return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const parsed = CreateExportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }
  const out = await exportsService.createAndDispatch(ctx.orgId, ctx.userId, parsed.data);
  return NextResponse.json(out, { status: 202 });
}
