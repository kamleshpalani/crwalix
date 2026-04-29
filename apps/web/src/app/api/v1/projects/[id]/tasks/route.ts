import { NextResponse } from "next/server";
import { CreateProjectTaskSchema } from "@crawlix/shared";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { projectKickoffService } from "@/server/services/project-kickoff.service";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const tasks = await projectKickoffService.listTasks(ctx.orgId, params.id);
  return NextResponse.json({ tasks });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = CreateProjectTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid body",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }
  const task = await projectKickoffService.createTask(
    ctx.orgId,
    params.id,
    parsed.data,
  );
  if (!task) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Project not found" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ task }, { status: 201 });
}
