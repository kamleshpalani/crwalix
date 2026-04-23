import { NextResponse } from 'next/server';
import { requireOrg, isResponse } from '@/lib/auth';
import { projectsService } from '@/server/services/projects.service';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  const project = await projectsService.get(ctx.orgId, params.id);
  if (!project) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, { status: 404 });
  }
  return NextResponse.json({ project });
}
