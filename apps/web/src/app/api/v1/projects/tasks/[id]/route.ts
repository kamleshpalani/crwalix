import { NextResponse } from "next/server";
import { UpdateProjectTaskSchema } from "@crawlix/shared";
import {
  requireOrg,
  isResponse,
  isAuthError,
  hasProjectAccess,
  requireRole,
} from "@/lib/auth";
import { projectKickoffService } from "@/server/services/project-kickoff.service";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const denied = requireRole(ctx, hasProjectAccess);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const parsed = UpdateProjectTaskSchema.safeParse(body);
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
  const task = await projectKickoffService.updateTask(
    ctx.orgId,
    params.id,
    parsed.data,
  );
  if (!task) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Task not found" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ task });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });
  const denied = requireRole(ctx, hasProjectAccess);
  if (denied) return denied;
  const ok = await projectKickoffService.deleteTask(ctx.orgId, params.id);
  if (!ok) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Task not found" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
