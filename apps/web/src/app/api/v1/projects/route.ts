import { NextResponse } from 'next/server';
import { requireOrg, isResponse } from '@/lib/auth';
import { projectsService, CreateProjectSchema } from '@/server/services/projects.service';

export async function GET() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  const items = await projectsService.list(ctx.orgId);
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  const body = await req.json().catch(() => ({}));
  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }
  const project = await projectsService.create(ctx.orgId, ctx.userId, parsed.data);
  return NextResponse.json({ project }, { status: 201 });
}
