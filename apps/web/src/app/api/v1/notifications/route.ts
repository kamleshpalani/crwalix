/**
 * GET /api/v1/notifications
 *
 * Query params:
 *   limit   — max items to return (1-100, default 50)
 *   unread  — "true" to return only unread notifications
 */
import { NextRequest, NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { notificationsService } from "@/server/services/notifications.service";

export async function GET(req: NextRequest) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const rawLimit = Number.parseInt(sp.get("limit") ?? "50", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(100, Math.max(1, rawLimit))
    : 50;
  const unreadOnly = sp.get("unread") === "true";

  const [items, unreadCount] = await Promise.all([
    notificationsService.list(ctx.orgId, { limit, unreadOnly }),
    notificationsService.unreadCount(ctx.orgId),
  ]);

  return NextResponse.json({ items, unreadCount });
}
