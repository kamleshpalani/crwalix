/**
 * PATCH /api/v1/notifications/mark-read
 *
 * Body (optional):
 *   { ids: string[] }  — mark specific notifications read
 *   {}                 — marks ALL unread notifications read for the org
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { notificationsService } from "@/server/services/notifications.service";

const Body = z
  .object({
    ids: z.array(z.string().uuid()).optional(),
  })
  .optional();

export async function PATCH(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    /* empty body is fine — marks all read */
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", issues: parsed.error.issues } },
      { status: 400 },
    );
  }

  const ids = parsed.data?.ids;
  const updated =
    ids && ids.length > 0
      ? await notificationsService.markRead(ctx.orgId, ids)
      : await notificationsService.markAllRead(ctx.orgId);

  return NextResponse.json({ updated });
}
