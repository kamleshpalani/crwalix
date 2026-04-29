import { NextResponse } from "next/server";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { auditService } from "@/server/services/audit.service";

export async function GET(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const entries = await auditService.list(ctx.orgId, {
    action: url.searchParams.get("action") ?? undefined,
    target: url.searchParams.get("target") ?? undefined,
    userId: url.searchParams.get("userId") ?? undefined,
    since: url.searchParams.get("since") ?? undefined,
    until: url.searchParams.get("until") ?? undefined,
    limit: limitRaw ? parseInt(limitRaw, 10) : undefined,
  });
  return NextResponse.json({ entries });
}
